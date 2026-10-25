# macOS and Linux build plan

Status: scoped 2026-10-25 against main `c9a3778`. Nothing is implemented yet, and the user decides
when implementation starts. This file is over the 6 KiB plan target because it carries the whole
pre-implementation scope. Once Phase 1 lands, cut it down to the remaining work.

## Goal

BitGit should install and run its full workflow on macOS and Linux with the same invariants as on
Windows: projects, Git, publishing, recovery, editor launch and the GitHub token.

## Current state

- `release.yml` already builds every platform (`"targets": "all"`). The published 1.1.2 release
  carries macOS dmg files (x64, aarch64), `.app.tar.gz` updater bundles, and a Linux AppImage, deb
  and rpm.
- Those builds cannot start the Git service. `GitService::new` (`src-tauri/src/git_service.rs:105`)
  looks for `<exe dir>/_up_/git-service/dist/index.js`, and only the Windows layout matches that.
  This was verified by listing the 1.1.2 artifacts without running them:
  - macOS puts the script at `BitGit.app/Contents/Resources/_up_/…`, with the binary at
    `Contents/MacOS/BitGit`.
  - The deb puts it at `/usr/lib/bit-git/_up_/…`, with the binary at `/usr/bin/bit-git`.
- An app launched from Finder or a desktop menu does not get the shell's PATH. The launchd PATH
  is `/usr/bin:/bin:/usr/sbin:/sbin`, so `node`, Homebrew `git` and `code` are not found. Expected,
  not observed here.
- These parts are already portable and need no change:
  - path validation and keys (`recovery_request.rs`, `project_sync.rs::normalize_path_key`)
  - the `.gitignore` link check
  - process groups in the Node check runner
  - `GIT_CONFIG_GLOBAL=/dev/null`
  - keyring credentials on non-Windows targets
  - the macOS Edit menu: Tauri 1.8.3 adds the default menu, so Cmd+C/V work. Verified in the
    tauri source.
- One thing is deliberately unchanged: on macOS the vault key keeps path case. Lowercasing it would
  merge distinct folders on case-sensitive APFS. Keeping case only splits history when one folder
  is reached by two spellings.

## Decisions for the user

| # | Question | Recommendation and reason |
|---|---|---|
| D1 | Minimum macOS | 11.0. Node.js 22 needs macOS 11 or later (its BUILDING.md), and the aarch64 Rust target starts at 11. The current `10.13` cannot be tested on GitHub runners. |
| D2 | Linux formats | AppImage only for now. The 1.1.2 deb depends on `libwebkit2gtk-4.0-37` (verified), which Ubuntu 24.04 and Debian 13 do not ship. The AppImage carries its webview and gets Tauri updates. deb and rpm come back with Tauri 2. Alternative: keep the deb, labelled Ubuntu 22.04 / Debian 12. |
| D3 | macOS signing and notarization | Ship unsigned first. Signing needs an Apple Developer account ($99/yr). Without it, on macOS 15 each user must allow the app once under System Settings > Privacy & Security > Open Anyway. Keychain may also prompt again after updates, because ad-hoc signatures change. |
| D4 | Node.js | Keep Node a user prerequisite, as on Windows, and find it through the login-shell PATH. Bundling Node as a sidecar removes the prerequisite but adds a Node binary per target and needs signing on macOS. Defer. |
| D5 | Symlinked ancestors of a project | `assertNoLinks` checks every path component from `/`. So Fedora Atomic (`/home` → `/var/home`) rejects every project and the vault, and macOS rejects anything under `/tmp`, `/var` or `/etc`. Proposal: on macOS and Linux, store the `realpath` when a project is added, and check links from the project root down. This changes a recovery coverage rule. Windows unchanged. |
| D6 | The 1.1.2 macOS and Linux artifacts | Release Phase 1 as 1.1.3. The updater reaches `.app` and AppImage installs; deb and rpm users must reinstall by hand. Separately, decide whether to annotate the 1.1.2 release notes now. |
| D7 | Local Linux testing | This machine has no WSL or Docker (verified). Installing WSL2 would let Linux tests and a WSLg GUI smoke run here. Optional; it is a system change. |

## Risks

| Area | Problem | Mitigation |
|---|---|---|
| Instance lock | Off Windows, `instance_lock.rs:39` is a no-op, so two processes can corrupt the data dir. On Linux every launch is a new process. On macOS, terminal launches and `open -n` are too. | Phase 1. On Unix, use std `File::try_lock` (Rust 1.89, flock). `WouldBlock` means already running; any other error starts without the lock. Keep the Windows `share_mode(0)` code: LockFileEx can release late after a crash. Run the existing tests on every OS. Unverified: whether the blocking dialog shown before the event loop appears on macOS and GTK. |
| Process handling | On Unix, a `runGit` timeout (`git-operations.ts:42`) kills only `git`, so transport helpers can survive. A check that calls `setsid` escapes its process group, which the Windows job object prevents. | Phase 2. Spawn git detached and kill the group, as `recovery-evidence.ts` does. Document the check limit. Linux cgroups come later. |
| Paths | `ProjectCard.tsx:376` joins the clone path with `\`, so on Unix the clone lands in a sibling folder named `parent\name`. The check copy (`recovery-evidence.ts:244`) and three recovery test files use an unresolved `os.tmpdir()`, which on macOS is reached through the `/var` link. By the code path, `recover()` rejects it
(`recovery-service.ts:251`), so checks fail on macOS. Not run. | Phase 1. |
| Editor launch | Unix detection runs `which` (`commands.rs:442`), which is missing on minimal distros. Launch uses the app's launch PATH. On macOS, `code` and `cursor` are on PATH only after the user installs the shell command. AppImage variables (`APPDIR`, `GTK_*`, `GDK_*`) may leak into editors (unverified). | Phase 1. Add a Unix branch to the existing `resolve_command_in` (regular file with an exec bit, no PATHEXT) and feed it the login-shell PATH. On macOS, fall back to the CLI inside `/Applications` and `~/Applications` app bundles. Phase 2: scrub AppImage variables if a test shows the leak. |
| Credentials | keyring 2.3.3 defaults to the macOS Keychain and, on Linux, to Secret Service (per its Cargo feature flags). Secret Service needs gnome-keyring, KWallet or KeePassXC running and unlocked, which bare window managers lack. | Phase 2. The error names the missing service. Tokens are never written to files. CLAUDE.md wording covers the three stores. |
| Bundle config | `tauri.conf.json` has `"targets": "all"` and `minimumSystemVersion` `10.13`. Tauri adds the webkit 4.0 deb dependency. No workflow runs tests on any OS. | Phase 1, following D1 and D2, plus a new `ci.yml`. |
| Node PATH | `node` is looked up on the launch PATH. nvm, fnm and volta live in shell rc files on both OSes. Ubuntu 22.04's apt `nodejs` is 12.x and cannot run the service. Node spawns `git` with the same PATH. Until Xcode CLT is installed, macOS `/usr/bin/git` is a shim that fails. | Phase 1. Resolve PATH once and pass it explicitly to every child. Startup errors name the node path, its version and the Node 20 floor, and point to `xcode-select --install`. |
| Data location | The GUI vault is `config_dir/BitGit/checkpoints`. The CLI default (`recovery-service.ts:39`) is `XDG_DATA_HOME` or `~/.local/share`, so GUI and CLI histories split on macOS and Linux. Unix creates files 0644. Vaults hold source, including untracked `.env` files, while Windows APPDATA is per-user. | Phase 1. The CLI default follows the GUI on every OS, and the data root is 0700 on Unix. CLI-only Linux vaults under `~/.local/share` then need the explicit vault-root flag. |
| Linux webview | Tauri 1 uses webkit2gtk 4.0. Blank windows have been reported under Wayland with NVIDIA (unverified for BitGit). | Check on real machines. Tauri 2 later. |

## Phase 1: runtime correctness (in scope now)

| File | Change |
|---|---|
| `src-tauri/src/login_path.rs` (new, `cfg(unix)`) | Compute PATH once, lazily, in a `OnceCell`. Run `$SHELL -ilc` (default `/bin/sh`) with stdin null and a 10 s timeout, and read a sentinel-delimited `$PATH`. Merge it with the current PATH, then with fallback dirs (`/opt/homebrew/bin`, `/usr/local/bin`, `~/.volta/bin`, `~/.local/bin`). Callers pass the result explicitly. There is no `set_var`, which is unsound once threads run. |
| `src-tauri/src/main.rs` | In `.setup()`, give `git_service` the path from `app.path_resolver().resolve_resource("../git-service/dist/index.js")`. In tauri 1.8.3 that maps `..` to `_up_` and finds `../Resources` on macOS, and `../lib/<package>` or `$APPDIR/usr/lib/<package>` on Linux (verified in source). |
| `src-tauri/src/git_service.rs` | `new()` uses the resolved script in release builds and keeps the debug path. `connect()` sets PATH from `login_path` on Unix. Startup failure reports the node path, `node --version` and the Node 20 floor. |
| `src-tauri/src/instance_lock.rs` | Unix `acquire` via `File::try_lock`. Drop `windows` from the test gate. |
| `src-tauri/Cargo.toml` | `rust-version = "1.89"`. |
| `src-tauri/src/app_data.rs` | On Unix, create the data root with mode 0700. |
| `src-tauri/src/commands.rs` | Replace `which` with a Unix branch of `resolve_command_in` over `login_path`. Add macOS app-bundle fallbacks for vscode, cursor and sublime, in both detection and launch. Unix spawns get `login_path`'s PATH. |
| `git-service/src/recovery-service.ts` | The default vault root matches Rust's `dirs::config_dir()`: win32 `APPDATA`, darwin `~/Library/Application Support`, otherwise `XDG_CONFIG_HOME` or `~/.config`, then `BitGit/checkpoints`. Create it 0700. |
| `git-service/src/recovery-evidence.ts` | Put the check holder under `fs.realpath(os.tmpdir())`. |
| `git-service/tests/recovery-{core,extensions,metadata}.test.mjs` | Resolve temp roots and their assertions with `realpath`, as `git-reliability-fixtures.mjs:18` already does. |
| `src/components/ProjectCard.tsx` | Join the clone path with the picker's separator, using the same rule as `RecoverCopy.tsx:36`. |
| `src-tauri/tauri.conf.json` | `minimumSystemVersion` per D1. Explicit `targets` per D2, e.g. `nsis, msi, app, dmg, appimage, updater`. |
| `.github/workflows/ci.yml` (new) | On push and PR, run on `windows-latest`, `macos-latest` and `ubuntu-22.04`: `npm ci`, service `ci` and `build`, `node --test git-service/tests/*.test.mjs`, `cargo test`, `npm run build`. |
| `.github/workflows/release.yml` | Release-note text per D2 (and D3 if signing). |

Gate: all Windows gates in `CLAUDE.md` stay green, `ci.yml` is green on all three runners, and the
real-machine checklist below passes.

## Phase 2: docs and polish (in scope after Phase 1)

| File | Change |
|---|---|
| `CLAUDE.md` | The product line names three OSes. The credential invariant names Windows Credential Manager, macOS Keychain and Linux Secret Service. Add the Unix test command. |
| `docs/RECOVERY_DEVELOPMENT.md`, `BUILD.md`, `INSTALL.md`, `README.md` | Per-OS prerequisites: Node 20+, Git, Xcode CLT, a Secret Service. Add the Gatekeeper first launch and AppImage use. |
| `docs/NATIVE_RECOVERY.md`, `docs/RECOVERY_GUIDE.md` | Credential backends, and the Unix limit that a `setsid` check can escape. |
| `src-tauri/src/credentials.rs` | The Linux error names the missing Secret Service. Ungate the format test, which rejects the token before touching any store. |
| `git-service/src/git-operations.ts` | Process-group kill for `runGit` timeouts on Unix. |
| `src/components/Dashboard.tsx` | Accept `metaKey` on macOS and show ⌘ in hints. |
| `src/components/AddProjectModal.tsx`, `LinkLocalModal.tsx` | Placeholders that are not Windows paths. |
| `src-tauri/src/commands.rs` | Scrub AppImage variables for editor launches, if a test shows the leak. |

## Later

- Migrate to Tauri 2. That brings webkit2gtk 4.1 and current-distro deb/rpm. Move the updater with
  v1-compatible artifacts so 1.1.x installs still update.
- macOS Developer ID signing and notarization (D3), a Node sidecar (D4), Linux arm64, a macOS
  universal binary, cgroup-scoped checks on Linux, Flatpak and Snap.

## Verification

- On this Windows machine: only Windows regressions can be checked, using the `CLAUDE.md` gates
  and a `tauri:dev` smoke run.
  - `cfg(unix)` code compiles only in CI: the gtk and webkit sys crates need the target's
    pkg-config, so cross-checking from Windows is not possible.
  - Pure helpers run everywhere, so give them unit tests: sentinel parsing, PATH merge, separator
    join.
- In CI (`ci.yml`): unit and service tests on macOS arm64 and Ubuntu 22.04. The first expected
  failure is the `/var` tmpdir link on macOS.
  - x64 macOS is cross-compiled only.
- On a real Mac and a Linux desktop (or VMs):
  - Finder and menu launch with Node from nvm only finds node and git.
  - A second launch shows the dialog.
  - Token save, read and restart work.
  - Each editor preset opens.
  - Gatekeeper first launch.
  - The 1.1.2 → 1.1.3 update for `.app` and AppImage.
  - AppImage on Ubuntu 24.04 and Fedora, including Wayland.
  - A check timeout ends its process group.
  - Recovery save, compare, recover copy and repair on a real project.

## Fork `zznam/bitgit` 17f5b3c, read as reference only

| Fork change | Use |
|---|---|
| `libc::flock` lock with `unsafe` | Same idea. Use std `File::try_lock` instead, so there is no `libc` and no `unsafe`. |
| Fixed PATH list plus `which node`, latest nvm by string sort | Fallback only. String sort picks v9 over v22, the nvm default alias is ignored, and Linux sessions are missed. The login-shell PATH goes first. |
| Service path guesses | The macOS guess is right. The Linux guess `lib/bitgit` is wrong (the 1.1.2 deb uses `bit-git`), and AppImage is missed. Use Tauri's resolver. |
| macOS editor `.app` paths | Take, as the fallback. |
| Windows `where.exe` first match | Superseded by `c9a3778`. Here, `where code` lists the extensionless `bin\code` script first (verified), which the fork would have spawned. |
| Clone path separator; ungated credential test | Take. |
| `BUILD.md` advice `xattr -cr` | Leave out: it strips quarantine wholesale. Document Open Anyway, or sign (D3). |

## Concurrent work

- `f6c2271` (deps), `05fe47d` (git hardening) and `c9a3778` (token per request, editor launch
  without `cmd /C`) landed before this plan. Phase 1 starts from them.
  - `commands.rs` now has `resolve_command_in`. Extend it; do not add a second resolver.
  - `GitService::recovery` now takes the token. It does not overlap `new()` or `connect()`.
- The main checkout holds another session's uncommitted `README.md` and
  `git-service/tests/ipc-concurrency.test.mjs` edits (2026-10-25). Phase 2's README change waits
  for them.
