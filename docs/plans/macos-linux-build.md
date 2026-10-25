# macOS and Linux build plan

Status: Phase 1 runtime code landed 2026-10-25 (`git log -- src-tauri/src/login_path.rs`) and passes
the Windows gates. It is not released and has not run on a Mac or a Linux machine. `ci.yml` has
not run yet: it starts on the first push. The decisions below are still open, and Phase 1's
bundle-config and release-notes rows wait on them. The file is over the 6 KiB plan target while
D1 to D7 are open.

## Goal

BitGit should install and run its full workflow on macOS and Linux with the same invariants as on
Windows: projects, Git, publishing, recovery, editor launch and the GitHub token.

## Decisions for the user

| # | Question | Recommendation and reason |
|---|---|---|
| D1 | Minimum macOS | 11.0. Node.js 22 needs macOS 11 or later (its BUILDING.md), and the aarch64 Rust target starts at 11. The current `10.13` cannot be tested on GitHub runners. |
| D2 | Linux formats | AppImage only for now. The 1.1.2 deb depends on `libwebkit2gtk-4.0-37` (verified), which Ubuntu 24.04 and Debian 13 do not ship. The AppImage carries its webview and gets Tauri updates. deb and rpm come back with Tauri 2. Alternative: keep the deb, labelled Ubuntu 22.04 / Debian 12. |
| D3 | macOS signing and notarization | Ship unsigned first. Signing needs an Apple Developer account ($99/yr). Without it, on macOS 15 each user must allow the app once under System Settings > Privacy & Security > Open Anyway. Keychain may also prompt again after updates, because ad-hoc signatures change. |
| D4 | Node.js | Keep Node a user prerequisite, as on Windows, found through the login-shell PATH. Bundling Node as a sidecar removes the prerequisite but adds a Node binary per target and needs signing on macOS. Defer. |
| D5 | Symlinked ancestors of a project | `assertNoLinks` checks every path component from `/`. So Fedora Atomic (`/home` → `/var/home`) rejects every project and the vault, and macOS rejects anything under `/tmp`, `/var` or `/etc`. Proposal: on macOS and Linux, store the `realpath` when a project is added, and check links from the project root down. This changes a recovery coverage rule. Windows unchanged. |
| D6 | The 1.1.2 macOS and Linux artifacts | Release Phase 1 as 1.1.3. The updater reaches `.app` and AppImage installs; deb and rpm users must reinstall by hand. Separately, decide whether to annotate the 1.1.2 release notes now. |
| D7 | Local Linux testing | No WSL or Docker here (verified). WSL2 would allow Linux tests and a WSLg GUI smoke. Optional system change. |

## Phase 1: what remains

| Item | State |
|---|---|
| `src-tauri/tauri.conf.json` | Waits on D1 and D2: `minimumSystemVersion` and explicit `targets` (e.g. `nsis, msi, app, dmg, appimage, updater`). Today it is `10.13` and `"targets": "all"`, so a release still ships the webkit 4.0 deb. |
| `.github/workflows/release.yml` | Waits on D2, D3 and D6: per-OS release-note text and the version. |
| `ci.yml` first run | Known failure on macOS and Ubuntu: `ipc-concurrency.test.mjs` "a held repository delays only its own later commands" spells the same repo as `toUpperCase() + '\\'`, a different path on POSIX. Off Windows use e.g. `held.work + '/'`. Fix it once the uncommitted edit to that file in the main checkout lands. The `/var` temp link is already handled. |
| Node floor | Startup failures on Unix name the node path, its version and the Node 20 floor. A Node 16 to 19 that can start the service is not refused: the service uses no Node 20-only API that was found. |
| `xcode-select --install` hint | Not added. The service starts without Git, so a missing Xcode CLT shows up as the `xcrun` error text from the failing Git command. Add the hint where the service reports Git failures (Phase 2, `git-operations.ts`). |

The Unix code compiles on Windows where it uses only portable std APIs. The remaining
`cfg(unix)` and `cfg(target_os = "macos")` code was type-checked for `aarch64-apple-darwin` in a
scratch crate. It has never run.

## Phase 2: docs and polish

| File | Change |
|---|---|
| `CLAUDE.md` | The product line names three OSes. The credential invariant names Windows Credential Manager, macOS Keychain and Linux Secret Service. Add the Unix test command. |
| `docs/RECOVERY_DEVELOPMENT.md`, `BUILD.md`, `INSTALL.md`, `README.md` | Per-OS prerequisites: Node 20+, Git, Xcode CLT, a Secret Service. Add the Gatekeeper first launch and AppImage use. The README waits for the uncommitted README edit in the main checkout. |
| `docs/NATIVE_RECOVERY.md`, `docs/RECOVERY_GUIDE.md` | Unix instance lock is a `flock` (the doc says "opened without sharing"); the login-shell PATH (`login_path.rs`); credential backends; a `setsid` check can escape its process group. |
| `src-tauri/src/credentials.rs` | The Linux error names the missing Secret Service. Ungate the format test, which rejects the token before touching any store. |
| `git-service/src/git-operations.ts` | Process-group kill for `runGit` timeouts on Unix (a timeout now kills only `git`, so transport helpers can survive). The `xcode-select --install` hint on Git failures. |
| `src/components/Dashboard.tsx` | Accept `metaKey` on macOS and show ⌘ in hints. |
| `src/components/AddProjectModal.tsx`, `LinkLocalModal.tsx` | Placeholders that are not Windows paths. |
| `src-tauri/src/commands.rs` | Scrub AppImage variables (`APPDIR`, `GTK_*`, `GDK_*`) for editor launches, if a test shows them leaking. |

Linux Secret Service needs gnome-keyring, KWallet or KeePassXC running and unlocked; bare window
managers lack one.

## Later

- Migrate to Tauri 2. That brings webkit2gtk 4.1 and current-distro deb/rpm. Keep v1-compatible updater
  artifacts so 1.1.x installs still update.
- macOS Developer ID signing and notarization (D3), a Node sidecar (D4), Linux arm64, a macOS
  universal binary, cgroup-scoped checks on Linux, Flatpak and Snap.

## Verification still needed

- `ci.yml` green on `windows-latest`, `macos-latest` (arm64) and `ubuntu-22.04`. x64 macOS is
  cross-compiled only.
- On a real Mac and a Linux desktop (or VMs):
  - Finder and menu launch with Node from nvm only finds node and git.
  - A second launch shows the "already running" dialog. It is shown before the event loop starts;
    whether that works on macOS and GTK is unverified.
  - Token save, read and restart work.
  - Each editor preset opens, including the macOS app-bundle fallback without the shell command.
  - Gatekeeper first launch.
  - The 1.1.2 → 1.1.3 update for `.app` and AppImage.
  - AppImage on Ubuntu 24.04 and Fedora, including Wayland.
  - A check timeout ends its process group.
  - Recovery save, compare, recover copy and repair on a real project.

Fork `zznam/bitgit` 17f5b3c: its ungated credential test is still to take (Phase 2). Leave out its
`xattr -cr` advice: it strips quarantine wholesale. Document Open Anyway, or sign (D3).
