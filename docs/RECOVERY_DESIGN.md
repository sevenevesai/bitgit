# Recovery architecture

The recovery workflow serves local AI builders saving milestones before experiments. Git users
keep their branch and staging selections. The API contract is
`git-service/src/recovery-types.ts`; the UI imports it through `src/types/recovery.ts`.

## Storage and capture

`RecoveryService(repoPath, options?)` owns a separate bare Git vault under the user's BitGit data
directory. `options.vaultRoot` supports tests and portable CLI use. The directory key hashes the
normalized absolute source path, so the UI and CLI share history. Source deletion must not prevent
listing or recovering checkpoints. Never initialize or modify the source repository during reads.

Capture records the actual working files, including eligible untracked files, without changing
HEAD, branches, remotes, or the real index. Enumerate candidates without following links or entering
nested repositories. Honor Git ignore rules and tracked files, then apply the shared protection
policy. For a Git source, enumerate through its own configuration so `.git/info/exclude` and
`core.excludesFile` apply to untracked files. Include application lockfiles by default. Record
every exclusion and the coverage limits.
Secret screening is a heuristic, not a guarantee. Databases, credentials, dependencies, external
services, and deployment state are outside source recovery.

Read selected bytes, verify the file set and content have not changed before publication, and fail
if the inspected fingerprint is stale. This detects concurrent edits; it is not a filesystem-wide
atomic snapshot. Bound capture size and refuse ambiguous or unsafe paths. Store byte-exact blobs
without clean filters or line-ending conversion. Use a temporary index in the vault, write a tree,
then an independent commit with a versioned manifest in its message and an immutable checkpoint
ref. Read the entire snapshot back against its manifest before publishing the ref: Git can silently
omit unsafe index paths while returning success. Independent commits prevent backing up one
milestone from uploading unrelated older snapshots.

Serialize mutations for a vault across UI and CLI processes. Report active lock contention; recover
abandoned locks only when the owning process is gone. Receipts/settings use atomic writes. No
automatic retention deletion: show that all checkpoints are kept and their location. Automatic
capture is opt-in, runs only while BitGit is open or a harness calls it, waits for inactivity, and
deduplicates unchanged content. Failed/incomplete saves never advance the protected version.

Git plumbing references: [hash-object](https://git-scm.com/docs/git-hash-object),
[update-index](https://git-scm.com/docs/git-update-index),
[commit-tree](https://git-scm.com/docs/git-commit-tree),
[update-ref](https://git-scm.com/docs/git-update-ref). Run commands as argument arrays, without a
shell. The explicitly requested check command is the only recovery API that executes a shell.

## Compare and recovery

Comparison describes the effect of restoring the checkpoint: add, replace, delete. Render text
previews with size limits and binary markers. Do not infer feature boundaries from file names.
Default recovery creates a new, previously nonexistent folder outside the source/vault. Reject
links, traversal, reserved paths, and collisions. Reject `.git` and Windows `git~<digits>` aliases
in every path component; repair also checks canonical parents to keep writes out of Git metadata.
The [Git path validator](https://raw.githubusercontent.com/git/git/master/path.c) explains the
short-name alias boundary. Write into a private temporary sibling folder,
verify every restored file hash, then publish the completed folder. Keep the current project intact.
Do not copy `.git`, run hooks, install dependencies, or claim the recovered application works.

Selective repair accepts explicit file paths and a current fingerprint. Recheck that fingerprint,
save the complete eligible current state as a safety checkpoint, then replace/delete only the
reviewed paths. Back up any touched file that was excluded from ordinary capture or refuse the
operation. Journal repair before writes and expose explicit rollback if interrupted; reads and
automatic capture never silently rewrite source files. Return the safety checkpoint ID.
Preserve the real index even if it now differs from restored working
files. Reject unsafe parent directories and concurrent changes. A retained safety checkpoint lets
the user recover forward. File selection is explicit; automatic semantic feature repair is absent.

## Remote backup

Publish only the selected vault commit to a unique `refs/heads/bitgit-checkpoints/<vault-key>/<id>`
ref, without force or branch integration/deletion. Show the chosen destination before upload.
Read the exact ref back from the remote and match its object ID before recording a backup receipt.
A historical receipt says when it was checked; verification failures remain visible. This proves
the remote ref, not application health. Recovery performs an independent byte verification.
After verifying an imported parentless commit and all its bytes, remove only that commit's shallow
boundary. It can then be exported to another remote without including unrelated history.

Remote discovery/import must work into a new vault, enabling recovery on another machine. Validate
imported manifests, object types, bounds and paths as untrusted input; reject symlinks/submodules.
Reapply protection policy before export and import. No credentials in URLs, manifests, files, or
logs. Native credential-manager tokens may pass transiently to the service; CLI uses Git's
credential helper. Reject executable remote helpers and unrecognized protocols.

## Evidence and regression finding

Manual observations and optional local screenshots attach to an exact checkpoint ID and never
implicitly certify it. Copy screenshots into the vault so later source edits cannot replace them.
Checks run only after an explicit user/harness request, in a fresh recovered copy with an enforced
timeout. Record the command, exit status, bounded output, time, and exact checkpoint. Commands have
normal user permissions; the isolated directory is not a security sandbox. Never auto-install or
run project scripts during save/restore. A passed check covers that command only.

Regression sessions choose an ordered range of milestones with user-provided good/bad endpoints.
Binary search selects candidates; the user opens a copy and marks good, bad, or untestable, or runs
an explicitly chosen check. Persist observations and skipped versions. A result is the first
observed failing milestone under a monotonic-failure assumption; skipped/flaky/external-state
changes make the boundary uncertain. Show those limits and all evidence. Never label a file or
commit the proven root cause.

## Integration and ownership

Node IPC `recovery` takes `{repoPath, request}` and returns the action's `RecoveryResults` value.
`RecoveryService.dispatch(request)` is shared by IPC and the JSON CLI. The native
`recovery_command(project_id, request)` resolves a saved project's local path and forwards it;
the browser cannot choose arbitrary vault roots. Native commands validate recognized actions.
Long checks use a scoped service process that is stopped and reaped on return. Other projects use
the shared service; the same vault remains serialized across both processes and the CLI.
The CLI accepts `--repo <absolute path>` and a JSON request on stdin, prints one JSON response,
and sets a nonzero exit code on failure. No server/listening port or arbitrary agent orchestration.

Existing Git status returns branch/upstream, ahead/behind, remote check timestamp and error.
Read failures do not silently initialize Git or mark it fresh/synced. Existing publish validates
at the service boundary, commits only explicitly selected files, and pushes clean unpushed commits.
`fullSync` updates the current upstream only and never integrates/deletes unrelated branches.
Explicit branch integration preserves `--no-ff` history and reports conflicts. Import persists
through the same project cache the dashboard loads. Refresh performs real status checks.

## Verification

Use disposable source repositories, bare local remotes and isolated data directories. Tests must
prove index/HEAD preservation, byte-exact recovery after source deletion, stale preview rejection,
exclusions, interrupted repair recovery, cross-process contention, remote object verification and
fresh-vault import, automatic idle/dedup behavior, evidence isolation and timeout, regression skip
semantics, and JSON CLI round trips. Native smoke uses isolated app data and disposable projects.
Builds: `npm run build`, `npm --prefix git-service run build`, `cargo check` in `src-tauri`.
Compilation does not replace driving the native save/compare/restore journey.

## Damaged local metadata

Immutable manifests and snapshot bytes remain authoritative. Unreadable receipt annotations set
`Checkpoint.metadataError` without hiding history or preventing compare/new-copy recovery. Receipt
writers refuse before running checks, repairing files or exporting. A completed recovered copy
returns `warnings` if its receipt cannot be saved; it must not be reported as a failed restore.
Unreadable repair journals set `RecoveryState.repairJournalError`; create, repair, rollback and
automatic ticks stay blocked. Never infer journal contents or overwrite damaged originals.
Metadata replacement syncs its temporary file before rename; this is not a power-loss guarantee.
Receipt writes use the reader's schema and 20 MiB serialized-byte limit before replacement, so
redaction expansion and JSON escaping cannot invalidate previously readable metadata. Commands
lengthened by redaction are bounded with an explicit truncation marker in their evidence record.

An empty ownership lock or orphaned `.reclaim` guard requires manual recovery: close BitGit and
stop all harness calls using that vault, confirm no process still owns it, then preserve a copy of
the vault and move only `operation.lock` and `operation.lock.reclaim` aside. Never clear a live lock
or infer staleness from age. This rare crash case remains a known limitation of the lock protocol.
For unreadable receipts or repair journals, recover a new copy from History before troubleshooting
the preserved metadata. Without a valid journal, automatic in-place undo cannot be trusted.
