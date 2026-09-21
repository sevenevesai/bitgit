# Native layer: recovery IPC, status, imports

Scope: `src-tauri/src`. Contracts: [recovery design](RECOVERY_DESIGN.md), `git-service/src/recovery-types.ts`,
`git-service/src/types.ts`. Rust holds no recovery logic: the Node service owns the vault, destinations,
receipts and restoration.

## `recovery_command(project_id, request) -> Value`

1. `recovery_request::validate_recovery_request` accepts a JSON object naming a recognized action in
   `RecoveryRequest`, with only that action's documented fields and JSON types. Unknown actions and
   fields (including `vaultRoot`, `repoPath`) are rejected, not forwarded; `null` optional fields are
   dropped. Values are the service's to validate. **Adding a request field or action to
   `recovery-types.ts` requires the same change in `recovery_request.rs`.**
2. The project is resolved from the saved cache; its `local_path` must be absolute with no `..`. It need
   not exist, so checkpoints of a deleted source stay listable and recoverable. The path is forwarded
   unchanged (no canonicalization: `\\?\` would change the service's vault key).
3. Forwards `service.execute("recovery", {repoPath, request, vaultRoot})` on a blocking thread. Rust
   supplies the vault root from the application data directory; callers cannot override it. The service holds its
   child lock for the whole response, so a slow recovery delays other Git commands.
4. Only `backup`, `verifyBackup`, `remoteList`, `remoteImport` read the credential-manager token and pass it
   via `setGithubToken` (service memory only). Local actions never touch credentials. The token is never
   logged or persisted, and is masked in returned errors. Requests are not logged.

## Status

`checkStatus` fields map into `GitStatus` (all new fields `serde(default)`): `currentBranch`, `upstream`,
`behindCommits`, `remoteCheckedAt`, `remoteError`. `SyncStatus` serializes snake_case, accepts the old
lowercase spellings, and adds `behind`, `diverged`, `unavailable`. `determine_sync_status` order:

| Condition | Status |
|---|---|
| not a repo | `not_connected` |
| no remote | `local_changes` if uncommitted/ahead, else `not_connected` |
| `remoteError`, or no `remoteCheckedAt` | `unavailable` |
| no upstream | as "no remote" |
| ahead and behind | `diverged` |
| behind (dirty: `both`) | `behind` |
| dirty or ahead | `local_changes` |
| otherwise | `synced` |

Unrelated remote branches never imply a merge. `ProjectStatus` keeps its enum: linked projects map
synced/needs_push/needs_merge (behind)/needs_sync (both, diverged); `unavailable`/`not_connected` map to
`ready`; local-only projects stay `local_only`. A failed check is **persisted** as `unavailable` with
`remoteError`, keeping the last-known counts and their `lastChecked`; `check_project_status` then returns
the project (not an error) so the UI cannot keep showing an older synced state. With no earlier check
`isGitRepo`/`hasRemote` are false (unconfirmed). Local-only sources are checked without GitHub. An older
service omitting the new fields never yields `synced`.

## Sync results

`push_local`/`full_sync` take `PublishOptions` and send `selectedFiles` (only when set) and `allowWarnings`
(default false). Results report only what the service returned: push count is 1 if `pushed` else 0, and a
commit that was not pushed is `success=false`; `pushed`/`deleted` for full sync and merge pass through and
are never assumed; full sync with errors is not success. `lastSynced` advances only when data moved (push
`pushed>0`, successful full sync, non-empty pull/merge) - never on failed, partial or no-op results.

## Imports and cache

`add_repositories` writes to `projects.json` through `project_cache::modify_projects`
(the in-memory map is gone; `get_repositories`, `check_repository_status`, `sync_repository` now delegate to
saved projects). Dedupe: local imports by normalized path (separators, case on Windows, trailing/`.`);
GitHub imports by lower-cased `owner/repo` from URL, `owner`+`repo`, or full name, matching linked and
unlinked projects. A match keeps its id and all user fields (only status is refreshed / missing GitHub link
fields filled). New ids are `name-<unix seconds>` with a numeric suffix on collision.

`fetch_github_repos` returns candidates for repository pickers without persisting them. The explicit
create/link flow chooses which repository becomes a saved project.

`ProjectStore` serializes every load, save and read-modify-write behind one process-wide lock, which fixes
lost updates and the shared `.tmp` race; `update_project(id, f)` re-reads under the lock so slow operations
do not overwrite concurrent edits. The atomic-write, `.bak` and recovery sequence is unchanged. Two BitGit
processes on one data directory are not coordinated.

`apply_project_template` drops the `Cargo.lock` rule from the `rust` template (application lockfiles stay
tracked). The rule itself is in `src/types/index.ts`; remove it there (UI) and the guard is a no-op.

## Verification

`cargo test` (isolated temp dirs; never APPDATA; no service launched) covers request validation, status
mapping, old-cache decoding, result counts, import persistence/dedupe, cache concurrency and template
handling. Runtime behavior against the Node service and UI is not verified here.

## Limits

- By code reading, a service crash is not detected or restarted: later commands fail until the app restarts.
- Local imports match by path only (no origin URL read), so a scan does not link to a GitHub-only project.
- `apply_project_template` overwrites an existing `.gitignore`.

Debug native smoke runs set an absolute `BITGIT_TEST_DATA_DIR`. Cache, settings, and recovery use that
isolated directory, and credential access is disabled. Release builds ignore the test override.
