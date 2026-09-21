# BitGit recovery roadmap

## Outcome

Completed on 2026-09-21 and merged into local `main` with `adb23c2` (`--no-ff`). The landed
file tree matched the verified integration candidate. UI/service builds, cargo check and CLI
help passed from the main checkout after landing. All 15 orchestration sessions are closed;
the parent's native smoke processes are stopped.

The authorized scope is delivered: named milestones and coverage, comparison, verified recovered
copies, remote backup/import, reliable visual Git, automatic saves, exact-version notes/screenshots
and checks, guided regression finding, selective file repair and a JSON harness CLI.

- [x] Implement the full roadmap and resolve independent review findings.
- [x] Verify service, UI and actual native workflows; land and re-verify main.
- [x] Update documentation, preserve existing user edits and close every worker.

## Evidence and entry points

[Verification and limits](RECOVERY_VERIFICATION.md) records the gates, actual native journeys,
independent reviews and documentation preservation. [Orchestration](RECOVERY_ORCHESTRATION.md)
records session IDs and available costs; parent Codex usage attribution is unavailable.
[Audience research](PRODUCT_REVIEW.md) explains the direction. Start with the
[recovery guide](RECOVERY_GUIDE.md), [extended workflows](RECOVERY_WORKFLOWS.md),
[visual Git guide](VISUAL_GIT_GUIDE.md), or [harness CLI](RECOVERY_AUTOMATION.md#cli).
Mechanisms and invariants remain in [the design](RECOVERY_DESIGN.md). Completed implementation
and integration details are in Git history; frozen review reports identify their snapshots.

## Continuing constraints

Use the existing secure token setup for this release. Browser sign-in follows GitHub OAuth app
registration, as the user directed. Feature-aware AI repair and participant recruitment remain
research hypotheses; implemented selective repair restores explicitly chosen whole files with a
safety save. Known abandoned-lock procedures and untested platform/transport boundaries are in
verification; they are not silent recovery guarantees.

The user's preexisting edits in `docs/HOW_TO_USE.md`, `.claude/*` and `.lloom/*` were preserved.
Only local integration was authorized; no GitHub publication or OAuth registration was performed.
Native fixtures and captures remain under `%TEMP%/bitgit-native-smoke-20260921-01` for inspection.
