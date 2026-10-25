# macOS and Linux build plan

Status (2026-10-25): the Phase 1 runtime (8d3e51a) and the decided release work
(`git log cea9ca6..` on `main`) are on local `main` and pass the Windows gates. Nothing is pushed or
released, and nothing has run on a Mac or a Linux machine. `ci.yml` and `release.yml` start on the
first push.

## Goal

BitGit installs and runs its full workflow on macOS and Linux with the same invariants as on
Windows: projects, Git, publishing, recovery, editor launch and the GitHub token.

## Decisions that constrain further changes

- macOS 11.0 minimum: Node.js 22 and the aarch64 target need it, and older versions cannot be
  tested on GitHub runners.
- Linux ships the AppImage only. `targets` lists `nsis, msi, app, dmg, appimage, updater`. The deb
  needs `libwebkit2gtk-4.0-37`, which Ubuntu 24.04 and Debian 13 lack; deb and rpm return with
  Tauri 2.
- macOS releases are signed and notarized with the existing Developer ID (as Graal RC and Loom
  are). `release.yml` fails without the six secrets in [BUILD.md](../../BUILD.md#macos-and-linux)
  and verifies with `codesign`, `spctl` and `stapler`. No Windows signing, no spend.
- macOS bundles carry only the service's runtime dependencies: the dev dependencies include
  esbuild's unsigned binary, which notarization rejects. A release adding a native dependency to
  `git-service` must sign it or keep it out of the bundle.
- Node.js stays a user prerequisite, found through the login-shell PATH. The code floor is 20;
  docs recommend 22 or 24.
- On macOS and Linux the service resolves physical paths at its boundary (`physicalPath`, see
  [recovery design](../RECOVERY_DESIGN.md#storage-and-capture)). Project config and receipts keep
  the user's spelling. Windows is unchanged, junction refusal included.
- Releases publish as prereleases: `releases/latest`, the updater feed, skips them until a person
  clears the flag.

## Open items

For the user, at publish time:
- The version (1.2.0 proposed) and whether to annotate the 1.1.2 notes, whose deb no longer
  installs on current distributions. This work bumps no version.
- Add `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`,
  `APPLE_API_ISSUER`, `APPLE_API_KEY` and `APPLE_API_KEY_CONTENT` to the repository, reusing the
  Developer ID and App Store Connect key that Graal RC and Loom use.
- Rewrite "What's New" in `release.yml`: it still describes 1.1.2.
- `softprops/action-gh-release@v1` runs on a retired Node version (actionlint); move to v2 before
  the first tagged release.

Code and docs, not started:
- `src/components/Dashboard.tsx`: accept `metaKey` on macOS and show ⌘ in hints.
- `AddProjectModal.tsx`, `LinkLocalModal.tsx`: placeholders that are not Windows paths.
- `src-tauri/src/commands.rs`: scrub AppImage variables (`APPDIR`, `GTK_*`, `GDK_*`) for editor
  launches, if a test shows them leaking.
- `README.md`: per-OS prerequisites. It waits for another session's uncommitted README edit.
- Known limit: when a symlinked project root's target is deleted, the dangling link's own path
  becomes the vault key, so that history shows only under the target's spelling until it returns.

## Later

Tauri 2 (webkit2gtk 4.1, current-distro deb and rpm; keep v1-compatible updater artifacts), a Node
sidecar, Linux arm64, a macOS universal binary, cgroup-scoped checks on Linux, Flatpak and Snap.

## Verification still needed

- `ci.yml` green on windows-2025, macos-15 (arm64) and ubuntu-22.04. The Unix-only tests run there
  first: physical paths, the status-fetch process-group kill, the Secret Service message. x64 macOS
  is cross-compiled only.
- First release run: the secrets check, notarization accepted with the pruned dependencies, the
  `codesign`/`spctl`/`stapler` checks, the bundle smoke pong on macOS and Linux, the prerelease flag.
- Hardened runtime without entitlements on a Mac: Keychain access, spawning `node` and the login
  shell, the webview.
- On a real Mac and a Linux desktop (or VMs):
  - Finder and menu launch with Node from nvm only finds node and git.
  - A second launch shows the "already running" dialog, shown before the event loop starts.
  - Token save, read and restart; on Linux, the Secret Service error without a keyring.
  - Each editor preset opens, including the macOS app-bundle fallback without the shell command.
  - The notarized DMG opens without a Gatekeeper prompt.
  - The 1.1.2 to next-version update for `.app` and AppImage.
  - AppImage on Ubuntu 24.04 and Fedora, including Wayland, and the NVIDIA workaround in INSTALL.md.
  - A check timeout and a status-fetch timeout end their process groups.
  - Recovery save, compare, recover copy and repair on a real project, including one under a
    linked ancestor (Fedora Atomic's `/var/home`, macOS `/tmp`).

The `zznam/bitgit` fork's ungated credential test is taken (1fb1a3a). Leave out its `xattr -cr`
advice: it strips quarantine wholesale.
