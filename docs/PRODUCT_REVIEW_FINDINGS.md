# Implementation evidence for the product review

Reviewed 2026-09-21 at `14b6aa6` plus the current working tree. These findings remain outstanding;
this review did not implement fixes. Product implications and research are in
[the audience and feature review](PRODUCT_REVIEW.md).

## Verification scope

- Frontend: `npm run build` passed TypeScript compilation and Vite production bundling. It emitted
  advisory warnings about stale browser-support datasets.
- Git service: `npm run build` in `git-service/` passed TypeScript compilation.
- Runtime probes: imported the freshly built `GitOperations` class and exercised five scenarios
  against disposable local bare remotes and clones. All five behaviors below were reproduced.
- Environment: Windows, Node 20.19.2, Git 2.45.1.windows.1. Fixture identities and Git configuration
  were isolated; there were no network remotes or real credentials in the fixtures.
- Native Tauri interaction, clean-machine installation, GitHub authorization, and macOS/Linux
  behavior were not exercised. Source-traced findings below are distinguished from runtime probes.

## Reproduced behaviors

### F1: Existing commits are skipped when the working tree is clean

Create a local commit on a branch tracking `origin/main`, leave no modified files, and call
`pushLocal()`. Before the call, `checkStatus()` reports one unpushed commit. The result is
`{ committed: 0, pushed: false }`, and the remote ref remains behind the local ref.

The early return ignores ahead commits in
[git-operations.ts:378](../git-service/src/git-operations.ts#L378).
The active Rust wrapper then reports success and `pushed: Some(1)` without checking `result.pushed`:
[commands.rs:956](../src-tauri/src/commands.rs#L956).

Consequence: someone who committed in an editor cannot rely on Push Local to publish that work.
Separate commit creation from pushing existing commits; report confirmed push results. Verify both
clean-ahead repositories and retry after a commit succeeded but its network push failed.

### F2: A behind-only repository can be classified as synced

Push a new main commit from another clone and call `checkStatus()` in the unchanged client. Git
reports one commit in `HEAD..origin/main`, but the returned object contains zero local changes,
zero unpushed commits, and an empty remote-branch list. There is no behind field.

The service logs but drops `status.behind`:
[git-operations.ts:174](../git-service/src/git-operations.ts#L174).
The Rust classifier treats those returned fields as synced:
[commands.rs:265](../src-tauri/src/commands.rs#L265), used by
[check_project_status](../src-tauri/src/commands.rs#L500).

Consequence: a dashboard cannot answer whether a machine has received remote changes. Model local
changes, ahead/behind, upstream, and remote freshness explicitly. Also preserve fetch failure as
visible uncertainty; the current service continues with local data after a failed fetch.

### F3: A conflicting branch can produce a successful Full Sync result

Create different edits to the same line on main and a remote feature branch, update the client main,
then call `fullSync()`. The feature cannot merge, remains on the remote, and the method returns:

```json
{"success":true,"message":"Full sync completed","committed":0,"merged":[],"errors":[]}
```

The branch loop catches failures, tries abort, and continues without returning the error:
[git-operations.ts:473](../git-service/src/git-operations.ts#L473).
Full Sync only records errors thrown out of that method:
[git-operations.ts:630](../git-service/src/git-operations.ts#L630).
`pullBranches()` uses a similar catch-and-continue pattern at line 550.

Consequence: success can conceal incomplete integration. Return per-branch and per-step outcomes;
preserve distinctions between merge failure, push failure after a merge, and cleanup failure after
a push. Report partial completion and stop steps that depend on a failed prerequisite.

### F4: Plain .env receives no validation warning

Add an untracked `.env` containing only a synthetic fixture value and call `validateBeforeSync()`.
The result is `canProceed: true`, `hasWarnings: false`, and `issues: []`.

The patterns cover suffixed environment filenames but omit plain `.env`:
[git-operations.ts:234](../git-service/src/git-operations.ts#L234).
Publishing stages all files at [git-operations.ts:403](../git-service/src/git-operations.ts#L403).

Consequence: a common credentials container can enter a commit without this feature warning the
user. Fix the filename gap and add content scanning of the selected data and outgoing commits.
This probe establishes a filename-validation gap; it does not measure a secret detector's recall.

### F5: Full Sync integrates and deletes an unfinished branch

Publish a conflict-free branch named `wip-experiment` containing a new file, then call `fullSync()`
on main. It returns success with that branch in `merged`. The remote main contains the experimental
file and the remote has only its main branch left.

Status includes origin branches except the hard-coded main/master/HEAD exclusions:
[git-operations.ts:153](../git-service/src/git-operations.ts#L153).
Full Sync passes that list to integration, whose loop pushes main and deletes each remote branch:
[git-operations.ts:445](../git-service/src/git-operations.ts#L445).
The UI's branch actions also pass the whole list:
[ProjectCard.tsx:623](../src/components/ProjectCard.tsx#L623).

Consequence: an unfinished experiment or alternative AI attempt is treated as ready to ship. This
is implemented behavior, not a claim that every invocation loses work. Require an explicit selected
integration set and distinct cleanup choice; discover repository defaults instead of assuming
main/master. Preserve the existing no-force-push and merge-history constraints.

## Additional findings traced through source

### F6: Scan/import writes a different collection from the dashboard's collection

Settings calls `add_repositories`, then refreshes the dashboard:
[SettingsModal.tsx:220](../src/components/SettingsModal.tsx#L220).
That command inserts into the in-memory `REPOSITORIES` map:
[commands.rs:288](../src-tauri/src/commands.rs#L288), through line 351.
The dashboard instead calls `load_projects`, backed by the persistent project cache:
[commands.rs:404](../src-tauri/src/commands.rs#L404).
`fetch_github_repos` follows the same legacy-map path. No bridge to persistent projects was found.

Expected symptom from this source path: a successful import toast without corresponding new
dashboard projects. Native UI reproduction is still needed. Route imports through the authoritative
project store, deduplicate paths/remotes, and check persistence after restart.

### F7: Validation is a card workflow, not a service invariant

Card actions invoke validation in
[ProjectCard.tsx:113](../src/components/ProjectCard.tsx#L113), but its exception handler proceeds to
sync after validation failure. The commit handler repeats that behavior at line 203.
Batch actions call `syncProject` directly:
[useAppStore.ts:450](../src/stores/useAppStore.ts#L450).
The active [sync_project command](../src-tauri/src/commands.rs#L935) does not validate internally.

Consequences: protection differs by entry point; failed validation does not establish permission to
publish. Move shared preflight into the service, return structured issues, and make any allowed
override explicit for the reviewed inputs. A file-size check of working files also misses large
blobs already present in outgoing commits; adding an ignore rule cannot erase those commits.

### F8: Queue and concurrency claims exceed the connected workflow

Queue/cancel/retry functions exist only in
[useAppStore.ts:572](../src/stores/useAppStore.ts#L572); no consuming queue UI or initial queue
processor was found. Cancellation marks pending records, not running Git processes.
Bulk buttons call `syncSelected`, not the helper with an explicit concurrency limit.
Rust holds one child-process mutex through the request/response exchange:
[git_service.rs:104](../src-tauri/src/git_service.rs#L104).

Consequence: async frontend calls do not establish parallel Git execution or a usable job queue.
Design observable jobs and repository-aware serialization before adding scheduled automation.
Do not repeat the README's speedup claims without measurement.

### F9: Manual refresh reloads cached projects

The header Refresh button calls `loadProjects`:
[Dashboard.tsx:260](../src/components/Dashboard.tsx#L260).
That loads persisted records; it does not perform the per-repository checks used by the card's
refresh action. Periodic checks exist separately.

Consequence: the most obvious refresh control need not fetch current Git facts. Connect it to a
bounded refresh that displays progress, individual failures, and the age of remote information.

### F10: Templates exclude application lockfiles

The Node template ignores package-lock.json and yarn.lock; the Rust template ignores Cargo.lock:
[types/index.ts:400](../src/types/index.ts#L400) and
[types/index.ts:488](../src/types/index.ts#L488). This can omit newly created dependency lockfiles
from saved source history, making an application's previous dependency set harder to reproduce.
Preserve application lockfiles and keep project-specific exceptions intentional.
[npm lockfile guidance](https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/),
[Cargo guidance](https://doc.rust-lang.org/cargo/guide/cargo-toml-vs-cargo-lock.html).
This is a source-traced template issue, not a reproduced installation failure.

## Existing assets and implementation entry points

| Area | Reuse / constraint |
|---|---|
| Dashboard and project cards | Extend `src/components/Dashboard.tsx` and `ProjectCard.tsx`; preserve search, archive, favorites, editor presets, and existing notes. |
| Publishing review | Extend `CommitModal.tsx` and `ProjectDetails.tsx`; the current diff service uses ordinary `git diff`, so staged and untracked content need explicit coverage. |
| Status and jobs | Extend the models in `src/types/index.ts`, `src-tauri/src/models.rs`, and `git-service/src/types.ts` consistently across IPC. |
| GitHub integration | `git-service/src/github-api.ts` handles basic repo/token operations; PRs, checks, permissions, and pagination beyond its first 100 repos need additional work. |
| Persistence | `src-tauri/src/project_cache.rs` protects project metadata with temporary files and backups. Source checkpoints require their own design and verified coverage. |
| Worktrees | The scanner can notice a directory containing a `.git` file, but the project model has one local path and no worktree relationships. Do not confuse discovery with lifecycle support. |
| Distribution | `src-tauri/tauri.conf.json` and `.github/workflows/release.yml` already configure installers/multiple platforms. Test the existing paths before proposing a new distribution system. |

## Engineering choices for the proposed recovery workflow

Reuse the Tauri shell, project cards, editor launching, and Git service. The existing project-cache
backup protects metadata, not source. Persist checkpoint metadata and job outcomes deliberately.

For source-only history, prototype ordinary Git objects with retained checkpoint refs and explicit
remote mapping. Keep automatic checkpoint history separate from the user's publishing workflow.
Evaluate a separate vault outside the project directory if protection must survive deletion of the
project or its .git directory; a separate folder alone is not a security boundary or off-machine copy.
If broad file backup becomes necessary, evaluate a maintained backup engine before creating one.

Keep a coverage manifest and retention policy, including which checkpoints exist remotely. An integrity
check and a successful restore drill are different facts. Materialize an exact snapshot in a fresh
folder for a drill; install/run only explicitly configured project commands. A worktree isolates
files, not untrusted code execution or external database effects.

Preserve no-force-push and merge-history constraints. Reversing published changes should create
new history rather than rewrite a shared remote. Model partial outcomes and retries; serialize
writes to shared repository state and recheck for external edits before applying a reviewed plan.

## Acceptance checks for subsequent implementation

The five runtime probes above should become outcome-focused regression cases when the related
behavior is changed. Extend them with offline fetch, non-main default branches, divergent histories,
partial push/cleanup failure, and changed input between review and execution. For onboarding and
jobs, add native scenarios proving imports survive restart, partial results remain visible, and
retry does not duplicate or conceal completed effects. Keep GitHub-dependent checks separate from
local fixture coverage.
