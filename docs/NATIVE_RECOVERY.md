# Native layer: recovery IPC, status, imports

Scope: `src-tauri/src`. Contracts: [recovery design](RECOVERY_DESIGN.md), `git-service/src/recovery-types.ts`,
`git-service/src/types.ts`. Rust holds no recovery logic: the Node service owns the vault, destinations,
receipts and restoration.

## `recovery_command(project_id, request) -> Value`

1. `recovery_request::validate_recovery_request` accepts a JSON object naming a recognized `RecoveryRequest`
   action with only its documented fields and JSON types. Unknown actions and fields (including `vaultRoot`,
   `repoPath`) are rejected, not forwarded; the service validates values.
   **A field or action added to `recovery-types.ts` must also be added to `recovery_request.rs`.**
2. The project comes from the saved cache; its `local_path` must be absolute with no `..` but need not exist,
   so checkpoints of a deleted source stay listable and recoverable. It is forwarded unchanged
   (canonicalizing would add `\\?\` and change the service's vault key).
3. Forwards `service.execute("recovery", {repoPath, request, vaultRoot})`. Rust
   supplies the vault root from the application data directory; callers cannot override it. The service
   holds its child lock for the whole response, so a slow recovery delays other Git commands.
4. Only `backup`, `verifyBackup`, `remoteList`, `remoteImport` read the credential-manager token and pass it
   via `setGithubToken` (service memory only); local actions never touch credentials. The token is never
   logged or persisted and is masked in returned errors; requests are not logged.

## Status

`checkStatus` maps into `GitStatus` (`types.ts` fields; the new ones are `serde(default)`). `SyncStatus`
is snake_case, accepts the old lowercase spellings, and adds `behind`, `diverged`, `unavailable`.
`determine_sync_status`, first match wins:

1. not a repo: `not_connected`
2. no remote: `local_changes` if uncommitted/ahead, else `not_connected`
3. `remoteError`, or no `remoteCheckedAt`: `unavailable`
4. no upstream: as 2
5. ahead and behind: `diverged`; behind: `behind` (`both` if dirty)
6. dirty or ahead: `local_changes`; otherwise `synced`

Unrelated remote branches never imply a merge. Linked projects map to `ProjectStatus` synced / needs_push /
needs_merge (behind) / needs_sync (both, diverged); `unavailable`/`not_connected` map to `ready`; local-only
stays `local_only`. A failed check is **persisted** as `unavailable` with `remoteError`, keeping the
last-known counts and `lastChecked`, and `check_project_status` returns the project, not an error, so no
stale synced state shows as current. With no earlier check `isGitRepo`/`hasRemote` are false (unconfirmed).
Local-only sources are checked without GitHub; a service omitting the new fields never yields `synced`.

## Sync results

`push_local`/`full_sync` send `selectedFiles` and `allowWarnings` (default false). Results
report only what the service returned: push count is 1 if `pushed` else 0; a commit not pushed is
`success=false`; full-sync/merge `pushed`/`deleted` pass through unassumed; full sync with errors is not
success; full sync also forwards `pulled` commits. `lastSynced` advances only on a reported push/pull count
or non-empty explicit branch integration, never on failed, partial or no-op results.

`validate_before_sync(project_id, selected_files?)` forwards the same selection as publishing.
`git_get_file_changes(repo_path)` returns staged/unstaged/untracked states; `git_get_diff` accepts
an optional scope and preserves scope/binary/truncated flags for the UI.

## Imports

`add_repositories` saves through `project_cache::modify_projects`; the in-memory map is gone
(`get_repositories`, `check_repository_status`, `sync_repository` use saved projects). Dedupe: local imports
by normalized path; GitHub imports by lower-cased `owner/repo` (URL, `owner`+`repo`, or full name), linked
or not. A match keeps its id and user fields.

`fetch_github_repos` returns candidates for repository pickers without persisting them. The explicit
create/link flow chooses which repository becomes a saved project.

`apply_project_template` prepends missing defaults and preserves existing rules last, so user exceptions
retain precedence. It refuses a linked `.gitignore`. Application templates include lockfiles.
Creating a GitHub repository initializes Git metadata and links an empty remote; publishing requires
a separate reviewed file selection, including the first commit.

## Cache and preservation

`ProjectStore` serializes every load, save and read-modify-write behind one process-wide lock;
`update_project` re-reads under it. Writes stay atomic (temp, verify, `.bak`, rename).

`projects.json` and `projects.json.bak` live in the app data directory (`%APPDATA%\BitGit`). A file that is
not a valid project list (corrupt, truncated, non-UTF-8, an unknown value such as a newer status; zero-length
excepted) is copied beside itself, byte for byte, just before a write or a restore from a valid `.bak`
replaces it: `<file>.corrupt-<UTC yyyyMMddTHHmmssfffZ>-<pid>-<n>`, created exclusively, read back, never
overwritten or deleted by BitGit. If that fails, the replacement is refused. With both files invalid, load
returns an empty list and writes nothing. A file that cannot be read (4 tries, ~150 ms) is never replaced:
writes fail with the reason and load serves the backup read-only. **Retrieve:** close BitGit, copy the wanted
`.corrupt-*` file over `projects.json`.

## Verification and limits

`cargo test` uses isolated temp dirs (never APPDATA) and no service; runtime IPC is not unit-tested.

- By code reading, a service crash is not detected or restarted: later commands fail until the app restarts.
- Local imports match by path only (no origin URL read), so a scan does not link to a GitHub-only project.
- The cache lock is in-process: two BitGit processes on one data directory are not coordinated.

Debug native smoke runs set an absolute `BITGIT_TEST_DATA_DIR`. Cache, settings, and recovery use that
isolated directory, and credential access is disabled. Release builds ignore the test override.
