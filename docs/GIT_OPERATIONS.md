# Git operations contract

Node service boundary for status, publishing, sync and diffs (`git-service/src/git-operations.ts`).
A green result means the remote was verified: counts come from Git, failures throw or return
`success: false`. Verified in `git-service/tests` by `git-reliability.test.mjs`,
`git-publish-review.test.mjs` and `ipc-publishing.test.mjs` (real Node IPC process); fixtures use
disposable repos, bare local remotes and isolated Git config. Run
`npm --prefix git-service run build` first.

## Status

`checkStatus(): Promise<StatusInfo>` never initializes Git, switches branches or edits remotes.
A folder that is not a repository root (including a subfolder of another repo) returns
`isGitRepo: false` with every field populated.

| Field | Meaning |
|---|---|
| `currentBranch` | Branch name, `null` when detached |
| `upstream` | Configured upstream (`origin/main`), `null` if none |
| `behindCommits` | Upstream commits missing locally (remote branch presence is not behind) |
| `unpushedCommits` | Ahead of the upstream; with none, commits on no remote-tracking ref |
| `remoteCheckedAt` / `remoteError` | Fetch time, or `null` + sanitized failure (30 s limit); counts then use the last known remote state |
| others | `hasRemote`, `uncommittedFiles`, `untrackedFiles`, `modifiedFiles`, `remoteBranches` (hides current, upstream, default) |

## Publishing

```ts
pushLocal(remoteUrl?, commitMessage?, commitDescription?, options?: PublishOptions)
  : Promise<{ committed: number; pushed: boolean }>
// PublishOptions { selectedFiles?: string[]; allowWarnings?: boolean }
```

- No selection (omitted or empty): nothing is staged. Unpushed commits are pushed; pending changes,
  including untracked files, throw `PublishError` (`outcome: 'needs-selection'`).
- Selection: exactly those whole files (working contents, deletions and untracked included) are
  committed with `git commit --only`; other staged entries and partial staging stay as they were.
  A failed commit (hook, identity) restores the index. `committed` is the file count.
- Paths must be pending changes reported by Git. Unknown, absolute, `..`, option-like (leading `-`),
  control-character, directory and glob-style names are rejected before anything changes; `\`
  separators are accepted. Files whose names start with `-` cannot be selected.
- Target: the branch's actual upstream, else `origin/<branch>` with `-u`. `remoteUrl` never rewrites
  an existing origin (mismatch throws; credentials and `.git` are ignored). An absent origin is added
  just before the push, after validation passes (also in `fullSync`); a rejected push leaves it configured.
- Refused: detached HEAD, merge/rebase/cherry-pick/revert in progress, conflicts, local branch behind.
  Never `--force`; no pull or rebase.
- `pushed` is true only after `git push` succeeded and the tracking ref matches `HEAD`. A rejected
  push throws `outcome: 'push-failed'` with `committed` set.
- Runtime options are validated: `options` must be an object and `allowWarnings` a boolean.

## Validation (every publish path)

Applies to `pushLocal`, `fullSync`, `mergeBranches`/`pullBranches`, `pushToRemote`, tag pushes and
`validateBeforeSync`. It inspects the selected working files and every blob added by outgoing commits
(reachable from the pushed commit, not from a remote-tracking ref of the target remote; no history
limit; merges count only what they introduce). Unselected working files are ignored. Screening uses
`exclusionReason` (`recovery-policy.ts`) plus size and pattern warnings:

- **Block (never overridable):** `.env*` (not `.example/.sample/.template`), key/credential files,
  credential patterns in content, files over 100 MiB.
- **Warn (need `allowWarnings: true`):** dependency/build folders, databases, logs, files of 50 MB or more,
  archives/media, OS/IDE files. Application lockfiles are never flagged.
- Issues carry path, reason and size, never content. Outgoing hits name the commit and cannot be fixed
  with `.gitignore`. Selected deletions publish no content.

`validateBeforeSync(options?): Promise<PreSyncValidation>` reports the same issues; without
`selectedFiles` it covers outgoing commits only. Blocked publishes throw
`PublishError { outcome: 'blocked', issues, committed }`; `committed > 0` means the new commit exists
locally but was not pushed.

## Tags

`pushTag(tagName, options?)` and `pushAllTags(options?)` validate before pushing: names (`git
check-ref-format`), that each tag points to a commit, and every blob reachable from those commits
that the remote lacks (a tag on an old, non-HEAD or merge-introduced secret blocks). Annotated tag
messages are screened for credentials. `pushAllTags` validates all tags first: one blocked tag publishes
none. Tags go to the branch's upstream remote, else `origin`, as the exact inspected object (annotated
stays annotated), never forced; an existing remote tag with another target is rejected.

## Full sync

`fullSync(remoteUrl?, commitMessage?, commitDescription?, options?): Promise<SyncResult>` syncs the
current branch with its actual upstream only: fetch, fast-forward when behind and clean, else the
`pushLocal` flow. It never merges, rebases or deletes other branches; `merged` is always `[]`.

| `outcome` | Success | Meaning |
|---|---|---|
| `up-to-date`, `fast-forwarded`, `published` | yes | Nothing to do / `pulled` commits / commit and/or push done |
| `needs-selection` | no | Pending changes, no `selectedFiles` |
| `dirty-behind`, `diverged` | no | Remote has new commits with local changes / both sides advanced; nothing touched |
| `conflicted`, `blocked` | no | Merge/conflicts in progress / validation failed |
| `fetch-failed`, `push-failed`, `failed` | no | Step failed; `committed` shows local progress |

`success`, `committed` (files), `pushed` (commits), `pulled`, `errors`, `issues` and `outcome` are
accurate. With no origin there is nothing to fetch: validation and the commit run first, then origin
is added and pushed.

## Explicit integration

`mergeBranches(branches, remoteUrl?, options?)` and `pullBranches(...)` merge named remote branches
into the current branch (`--no-ff`, validation, push, one at a time) and return their names, or throw
`BranchIntegrationError { branch, stage, merged, conflicts }` with `stage` `preflight | merge |
validation | push`. A conflict aborts the merge and leaves the branch unchanged. Source branches are
retained locally and remotely after every merge; `deleteBranch` stays a separate explicit action.
Requires a checked-out branch, no tracked-file changes, and a branch not behind its upstream. An
absent origin from `remoteUrl` is added first (fetching needs it).

## Files and diffs

- `getFileChanges(): Promise<FileChangeInfo[]>`: `{ path, staged, unstaged, untracked, conflicted }`.
- `getDiff(filePath?, scope?: 'staged' | 'unstaged' | 'untracked' | 'all' = 'all'): Promise<DiffInfo[]>`:
  entries carry `scope`; a partially staged file yields staged and unstaged entries; untracked files
  preview as additions; `binary`/`truncated` (5000 lines, 1 MiB) are flagged.
- `pushToRemote(localPath, remoteName, branch, options?)` pushes through
  `pushExistingCommits(remote, branch, options)` with validation.

## IPC and native callers

IPC forwards `selectedFiles`/`allowWarnings` for publishing, validation and merges, `scope` for
`getDiff`, and exposes `getFileChanges`; `pushTag`/`pushAllTags` are called without options until the
caller forwards `allowWarnings`. Rust exposes `git_get_file_changes` and forwards selection through
`sync_project` and `validate_before_sync`. Errors are ordinary `Error`s (sanitized `message`); read
`outcome`/`issues` from `PublishError` and `merged`/`stage` from `BranchIntegrationError`. Consumers
must honor `pushed` and `success`.

## Known limits

`initRepository` creates metadata only; the first commit needs reviewed files. Read methods refuse a
missing repository. Adding an existing remote refuses a different URL. Secret screening is heuristic.