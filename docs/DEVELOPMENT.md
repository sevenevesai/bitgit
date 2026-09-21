# Development

## Setup and gates

Use Windows 10/11, Git for Windows and Node.js 20 or later. Source builds also require Rust and
the Tauri Windows build prerequisites. Install both dependency trees with `npm ci` and
`npm --prefix git-service ci`. Build the service before the first `npm run tauri:dev`.
The root [CLAUDE.md](../CLAUDE.md#commands) holds the authoritative build/test commands.

`npm run tauri:dev` starts Vite and the native app. Drive the affected workflow and inspect errors;
a frontend build does not verify native IPC or filesystem effects. If port 5173 is occupied,
identify its owning PID and close only the dev server belonging to this task. Do not kill every
Node process; other projects and agent sessions may be running.

## Architecture and entry points

React invokes Tauri commands; Rust serializes requests to the Node Git service. The service owns
Git operations and recovery. Rust owns persisted projects, native credentials and command validation.

| Area | Entry |
|---|---|
| Project actions and validation UI | `src/components/ProjectCard.tsx` |
| Token management and repository scanning | `src/components/SettingsModal.tsx` |
| Recovery UI | `src/components/recovery/RecoveryWorkspace.tsx` |
| Native commands and registration | `src-tauri/src/commands.rs`, `main.rs` |
| Resilient project persistence | `src-tauri/src/project_cache.rs` |
| Git operations and validation | `git-service/src/git-operations.ts` |
| Node command routing | `git-service/src/ipc-server.ts` |

## Adding a command or component

For a Git operation, add the method in `git-operations.ts`, its handler in `ipc-server.ts`, and a
Rust wrapper in `src-tauri/src/git_service.rs`. Add a Tauri handler in `commands.rs`, register it in
`main.rs`'s `invoke_handler`, then call `invoke<ReturnType>('command_name', { params })` in the UI.
Keep Rust serde fields and TypeScript contracts aligned; Node replies carry the request ID,
`success`, and either `data` or an error. Recovery actions use the shared request/results union
and native allow-list described in [NATIVE_RECOVERY.md](NATIVE_RECOVERY.md).

UI components live under `src/components/`. Use local React state for local UI, Zustand for shared
state, toast for notifications, lucide-react for icons, and the existing Tailwind light/dark pattern
(`text-gray-900 dark:text-white`). Keep long lists and diff previews bounded.

## Investigation and user experience

Start from the user's problem. Read the relevant code and reproduce it before changing behavior;
add focused temporary logging when needed, then build, test and refine from observed behavior.
Favor a direct solution to the current problem. For cache damage, preserve what remains and recover
a valid backup; never tell users to discard their project history and start again.

Token validation runs when Settings opens; GitHub linking preselects the documented scopes. If a
valid token cannot perform an operation, inspect its repository access and scopes. Publishing errors
for files over 100 MiB are blocking; files over 50 MiB, dependency/build output, logs and databases
can warn. The validation UI offers ignore suggestions, but ignoring a tracked file does not remove
it from published history. Service rules and exact selection semantics live in
[GIT_OPERATIONS.md](GIT_OPERATIONS.md).

## Storage and verification

Projects live in `%APPDATA%/BitGit/projects.json`; atomic replacement, `.bak` recovery, quarantine
and their limits are defined in [NATIVE_RECOVERY.md](NATIVE_RECOVERY.md#cache-and-preservation).
Recovery vaults are separate from source repositories. Use the design and automation docs for
capture, remote receipts, evidence and interrupted-repair contracts.

Debug native tests may set an absolute `BITGIT_TEST_DATA_DIR`. That isolates cache, settings and
vault storage and disables credential access. Release builds ignore the override. Use disposable
repositories and bare remotes; record any untested GitHub/network or platform boundary explicitly.
Production installer creation and cross-platform support require their own verification.
