# BitGit project instructions

BitGit is a Windows desktop app for visual Git and code recovery during AI-assisted development.
Stack: React/TypeScript/Zustand/Tailwind → Tauri IPC/Rust → Node Git service/simple-git/Octokit.

## Commands

Run from the project root unless stated otherwise. Each build/check must exit 0.

```powershell
npm ci
npm --prefix git-service ci
npm --prefix git-service run build  # Required before the first native launch
npm run build                      # Frontend type check and Vite build
npm run tauri:dev                   # Drive the real native app; compilation is not a smoke test
npm run tauri:build                 # Production build
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
$testFiles = (Get-ChildItem git-service/tests -Filter '*.test.mjs').FullName
node --test $testFiles              # Disposable repositories; all tests must pass
```

When a port is busy, identify the owning process and stop only this task's dev server.
Development conventions and command wiring: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Invariants

- Keep source HEAD, index and remotes unchanged during reads and checkpoint capture.
- Publish only explicitly selected whole files or already committed changes. No implicit stage-all.
- Block credential/oversize errors at the service boundary. Only warnings can be explicitly overridden.
- Never force-push. Explicit branch merges use `--no-ff`; retain source branches.
- Preserve auto-commit format: `Auto-sync: ${new Date().toISOString()}`.
- Default recovery writes a new folder. Selective repair requires fresh comparison and a safety
  checkpoint; interrupted repair exposes explicit rollback and never silently rewrites current work.
- Preserve damaged cache bytes before replacement; use atomic writes and recover valid backups.
  Keep recovery history accessible when source files or automation settings are unavailable.
- GitHub tokens live in Windows Credential Manager, never files. Token validation happens in
  Settings; required scopes are `repo` or `public_repo`, plus `read:user`.
- Check commands run only on explicit request, with normal user permissions, in a recovered copy.
  Saving, listing and restoring never install dependencies or execute project scripts.

## Maps and contracts

- [Recovery design](docs/RECOVERY_DESIGN.md): vault, coverage, repair, remote trust and verification.
  Types: `git-service/src/recovery-types.ts`; UI re-export: `src/types/recovery.ts`.
- [Automation and CLI](docs/RECOVERY_AUTOMATION.md): idle saves, evidence, checks and regression state.
- [Git operations](docs/GIT_OPERATIONS.md): selection, validation, status, diffs and branch semantics.
- [Native integration](docs/NATIVE_RECOVERY.md): command validation, cache, credentials and test isolation.
- [Recovery plan](docs/RECOVERY_PLAN.md): remaining work and pickup evidence; finished work is in Git.
- [Recovery guide](docs/RECOVERY_GUIDE.md): user workflow and coverage limits.
