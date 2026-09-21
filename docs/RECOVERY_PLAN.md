# BitGit recovery roadmap

## Goal

Deliver the full roadmap authorized on 2026-09-21: named milestones and coverage, comparison,
safe recovered copies, verified remote backup/import, reliable visual Git, automatic saves,
exact-version evidence/checks, guided regression finding, selective file repair and a harness CLI.
Audience/rationale: [product review](PRODUCT_REVIEW.md). Invariants/API:
[recovery design](RECOVERY_DESIGN.md). No model service is required.

## Integration status

All code remains on `feat/recovery-integration` in `S:/BitGit-wt-integration` until final review.
Checked items below mean implemented and parent-verified in that candidate, not released.

- [x] Checkpoint capture/list/compare, explicit coverage and byte-exact recovered copies.
- [x] Selective file repair, safety checkpoints, stale guards and explicit interrupted-repair undo.
- [x] Verified remote export/import and fresh-vault recovery after source loss.
- [x] Git status, selected publishing, service validation, clean pushes and safe current-upstream sync.
- [x] Native recovery IPC, persistent imports, honest status/results and damaged-cache preservation.
- [x] Base recovery UI; actual native save/compare/selected repair/recover/remote-import flow exercised.
- [x] Automatic idle/deduplicated saves, evidence/checks, regression state and JSON harness CLI backend.
- [ ] Complete and verify automatic-save, evidence/check and regression UI workflows.
- [ ] Complete and verify visual Git selection/diffs/status, explicit branches and bulk outcomes.
- [ ] Fresh independent review of resolved foundation findings and the complete backend/extensions.
- [ ] Resolve findings and run final service/UI/native gates on the integrated tree.
- [ ] Restart and drive the latest native app with isolated data, including extension workflows.
- [ ] Update user/developer docs, record verification limits, land and re-verify main.
- [ ] Close remaining workers and report shipped commits and available orchestration costs.

## Current evidence and pickup

Candidate `624a1fb` includes fixes for foundation review H1/H2/M1/M2/M3/M4/L1; the fresh verifier
must confirm them. Parent also closed a tag-ref race, made cache replacement atomic on Windows,
and added Windows Job Object supervision for exact-version checks.
Parent gates: 131 service tests pass before the last tag-race test; that regression passes separately.
Native 85 tests and cargo check pass. Final expected service count is 132. Frontend extension
workers are still running. Findings source: `RECOVERY_FOUNDATION_REVIEW.md` (frozen earlier tree).

Native smoke root: `%TEMP%/bitgit-native-smoke-20260921-01`; app-data override isolates cache,
vault and credentials. Own Vite/CDP ports 5177/9227. Earlier binary passed source-loss and fresh-vault
remote recovery using a disposable bare remote; it must be rebuilt/restarted for current changes.
No real GitHub credentials or network publishing have been tested or authorized.

## Active work and ownership

| Worker | Session | Worktree / owned area |
|---|---|---|
| UI-EXTENSIONS | 31849348-eba3-439f-85ba-422228cab47d | S:/BitGit-wt-ui-extensions; recovery UI/lib and App observer |
| UI-GIT | a2f8d279-c2d0-4c4b-a068-e487642314ce | S:/BitGit-wt-ui-git; Git components, store and frontend Git types |
| MAP-FINAL-REVIEW | 0591d74c-5ecb-490d-af81-2f17e9397201 | S:/BitGit-map-final-review; read-only verifier map |

GIT and EXTENSIONS implementations are integrated; retain their sessions until verification is
recorded. RECOVERY-UI and NATIVE workers are closed after parent gates and integration. Earlier
maps and the foundation verifier are closed; their outcomes and costs remain in Lloom history.
Parent session: `aad26266-17c8-4043-a9eb-8fb1b6c45240`; Codex usage attribution is unavailable.

Parent owns strategy, plan/design, shared contracts, novel safety mechanisms, integration and landing.
Haiku maps precede bounded Sonnet implementation briefs; fresh Opus contexts verify nontrivial work.
Workers use isolated worktrees, explicit-file commits and no merges/pushes. Rebase and run gates
before landing. The project's `--no-ff` convention overrides the skill's fast-forward default.

Preserve user edits in `docs/HOW_TO_USE.md`, `.claude/*` and `.lloom/*`; exclude them from task commits.
Browser GitHub authorization needs a registered client ID. Use existing secure token setup unless
the user provides one; do not fabricate credentials or register an external app. Research proposals
for semantic AI repair and user recruitment remain validation ideas, not shipped capability claims.
