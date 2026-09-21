# Git operations contract

Node service boundary for status, publishing, sync and diffs (`git-service/src/git-operations.ts`).
A green result means the remote was verified: counts come from Git, failures throw or return
`success: false`. Verified by `node --test git-service/tests/git-reliability.test.mjs` (disposable
repos, bare local remotes, isolated Git config; run `npm --prefix git-service run build` first).

## Status

`checkStatus(): Promise<StatusInfo>` never initializes Git, switches branches or edits remotes.
A folder that is not a repository root (including a subfolder of another repo) returns
`isGitRepo: false` with every field populated.

| Field | Meaning |
|---|---|
| `currentBranch` | Branch name, `null` when detached |
| `upstream` | Configured upstream (`origin/main`), `null` if none |
| `behindCommits` | Commits in the upstream missing locally (remote branch presence is not behind) |
| `unpushedCommits` | Ahead of the upstream; with no upstream, commits on no remote-tracking ref |
| `remoteCheckedAt` / `remoteError` | Fetch time, or `null` + sanitized failure (30 s limit). Counts then use the last known remote state |
| `hasRemote`, `uncommittedFiles`, `untrackedFiles`, `modifiedFiles`, `remoteBranches` | As before; `remoteBranches` also hides the current, upstream and remote default branch |

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
- Paths must be pending changes reported by Git. Unknown, absolute (`/x`, `C:\x`), traversal (`..`),
  option-like (leading `-`), control-character, directory and glob-style names are rejected before
  anything changes. Windows `\` separators are accepted. Files whose names start with `-` cannot be
  selected.
- Target: the branch's actual upstream; otherwise `origin/<branch>` with `-u`. `remoteUrl` never
  rewrites an existing origin (mismatch throws; credentials and `.git` are ignored in the
  comparison); an absent origin is added just before the push, after validation passes.
- Refused: detached HEAD, merge/rebase/cherry-pick in progress, unresolved conflicts, local branch
  behind (`diverged`/`dirty-behind`). Never `--force`; no pull or rebase.
- `pushed` is true only after `git push` succeeded and the tracking ref matches `HEAD`.
  A rejected push throws `outcome: 'push-failed'` with `committed` set.

## Validation (every publish path)

Applies to `pushLocal`, `fullSync`, `mergeBranches`/`pullBranches` (before each push),
`pushToRemote` and `validateBeforeSync`. It inspects the selected working files and every blob
added by outgoing commits (reachable from `HEAD`, not from any remote-tracking ref of the target
remote; no history limit; merges count only what they introduce). Unselected working files are ignored.

Screening uses `exclusionReason` (`recovery-policy.ts`) plus size and pattern warnings:

- **Block (never overridable):** `.env*` (not `.example/.sample/.template`), key/credential files,
  credential patterns in content, files over 100 MiB.
- **Warn (need `allowWarnings: true`):** dependency/build folders, databases, logs, files at least 50 MB,
  archives/media, OS/IDE files. Application lockfiles are never flagged.
- Issues carry path, reason and size, never content. Outgoing hits name the commit and cannot be
  fixed with `.gitignore`. Selected deletions publish no content and are not screened.

`validateBeforeSync(options?: PublishOptions): Promise<PreSyncValidation>` reports the same
issues; without `selectedFiles` it covers outgoing commits only. `canProceed` is false on errors;
`hasWarnings` tells the UI to ask for `allowWarnings`. Blocked publishes throw
`PublishError { outcome: 'blocked', issues, committed }`; `committed > 0` means the new commit exists
locally but was not pushed.

## Full sync

```ts
fullSync(remoteUrl?, commitMessage?, commitDescription?, options?: PublishOptions): Promise<SyncResult>
```

Syncs the current branch with its actual upstream only: fetch, fast-forward when behind and clean,
else the `pushLocal` flow. It never merges, rebases or deletes other branches; `merged` is always `[]`.
`success`, `committed` (files), `pushed` (commits transferred), `pulled`, `errors`, `issues` and
`outcome` are accurate:

| `outcome` | Success | Meaning |
|---|---|---|
| `up-to-date`, `fast-forwarded`, `published` | yes | Nothing to do / `pulled` commits / commit and/or push done |
| `needs-selection` | no | Pending changes, no `selectedFiles` |
| `dirty-behind` | no | Remote has new commits and local changes exist; nothing touched |
| `diverged` | no | Local and remote both have new commits; nothing touched |
| `conflicted` | no | Merge in progress or unresolved conflicts |
| `blocked` | no | Validation failed; nothing pushed |
| `fetch-failed`, `push-failed`, `failed` | no | Step failed; `committed` shows local progress |

## Explicit integration

`mergeBranches(branches, remoteUrl?, options?)` and `pullBranches(...)` return the integrated branch
names or throw `BranchIntegrationError { branch, stage, merged, conflicts }` with `stage` one of
`preflight | merge | validation | push | cleanup`. Each branch: `--no-ff` merge, validation, push.
A conflict aborts the merge and leaves the branch unchanged. `mergeBranches` then deletes the merged
remote branch (and the local one if `git branch -d` accepts it), only after a verified push;
`pullBranches` keeps it. Requires a branch checked out (no `main` assumption), no tracked-file
changes, and a branch not behind its upstream.

## Files and diffs

- `getFileChanges(): Promise<FileChangeInfo[]>`: `{ path, staged, unstaged, untracked, conflicted }`
  per pending path for building a selection.
- `getDiff(filePath?, scope?: 'staged' | 'unstaged' | 'untracked' | 'all' = 'all'): Promise<DiffInfo[]>`:
  each `DiffInfo` has `scope`; a partially staged file yields a staged and an unstaged entry;
  untracked files are previewed as additions; `binary` and `truncated` (5000 lines / 1 MiB) are flagged.
- `pushToRemote(localPath, remoteName, branch, options?)` keeps its branch handling, then pushes
  through `GitOperations.pushExistingCommits(remote, branch, options)` with validation.

## IPC and native callers

IPC forwards `selectedFiles`/`allowWarnings` for publishing and validation, `scope` for `getDiff`,
and exposes `getFileChanges`. Missing selections fail closed on dirty trees. Rust exposes
`git_get_file_changes` and forwards selection through `sync_project` and `validate_before_sync`.
Errors are ordinary `Error`s (`message` is sanitized); read `outcome`/`issues` from
`PublishError` and `merged`/`stage` from `BranchIntegrationError`. Consumers must honor `pushed`
and `success` instead of assuming a push.

## Known limits

`initRepository` creates metadata only; the first commit requires reviewed files. Read methods
refuse a missing repository instead of initializing it. Adding an existing remote refuses a
different URL. Secret screening is heuristic.

`node --test git-service/tests/ipc-publishing.test.mjs` exercises the real Node IPC process,
selected publishing and validation, index preservation, and initialization without an automatic commit.
