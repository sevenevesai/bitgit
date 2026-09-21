# BitGit recovery roadmap

## Goal

Deliver the full roadmap authorized on 2026-09-21: named milestones and coverage, comparison,
safe recovered copies, verified remote backup/import, reliable visual Git, automatic saves,
exact-version evidence/checks, guided regression finding, selective file repair and a harness CLI.
Audience/rationale: [product review](PRODUCT_REVIEW.md). Invariants/API:
[recovery design](RECOVERY_DESIGN.md). No model service is required.

## Integration status

All code remains on `feat/recovery-integration` in `S:/BitGit-wt-integration` until final review.
All implementation and independent review gates passed; local landing and session closure remain.

- [x] Checkpoint capture/list/compare, explicit coverage and byte-exact recovered copies.
- [x] Selective file repair, safety checkpoints, stale guards and explicit interrupted-repair undo.
- [x] Verified remote export/import and fresh-vault recovery after source loss.
- [x] Git status, selected publishing, service validation, clean pushes and safe current-upstream sync.
- [x] Native recovery IPC, persistent imports, honest status/results and damaged-cache preservation.
- [x] Base recovery UI; actual native save/compare/selected repair/recover/remote-import flow exercised.
- [x] Automatic idle/deduplicated saves, evidence/checks, regression state and JSON harness CLI backend.
- [x] Complete and verify automatic-save, evidence/check and regression UI workflows.
- [x] Complete and verify visual Git selection/diffs/status, explicit branches and bulk outcomes.
- [x] Fresh independent review of resolved foundation findings and the complete backend/extensions.
- [x] Resolve findings and run final service/UI/native gates on the integrated tree.
- [x] Restart and drive the latest native app with isolated data, including extension workflows.
- [ ] Update user/developer docs, record verification limits, land and re-verify main.
- [ ] Close remaining workers and report shipped commits and available orchestration costs.

## Current evidence and pickup

Source candidate `9347942` passed 140 service tests and both builds. Unchanged Rust sources passed
92 tests and cargo check on the rebased tree. Independent review resolved every foundation, N, F
and R finding requiring a code fix; abandoned ownership locks remain documented manual procedures.
The release reviewer confirmed all F findings with 27 focused checks and R findings with 10 more.
Historical reports identify their frozen snapshots. Integration is based on main; no source changes
remain pending. Land locally, re-verify the landed tree and close the final reviewer.

Native smoke root: `%TEMP%/bitgit-native-smoke-20260921-01`; app-data override isolates cache,
vault and credentials. Own Vite/CDP ports 5177/9227. Earlier binary passed source-loss and fresh-vault
remote recovery using a disposable bare remote. Latest native journeys also proved real idle saves,
screenshot attachment/display, explicit check failure, persisted Good/Bad/Skip search, interrupted
repair undo, preserved staging on publish, persistent failed backup checks, and recovered code with
damaged receipts/journals. Evidence and limits are in `RECOVERY_VERIFICATION.md`.
No real GitHub credentials or network publishing have been tested or authorized.

## Active work and ownership

| Worker | Session | Worktree / owned area |
|---|---|---|
| VERIFY-RELEASE | faaa1aeb-5a1d-42b2-a3e7-ed86119db1ca | S:/BitGit-wt-final-review; independent final review, report only |

All implementation workers, maps and earlier verifiers are integrated and closed; their reports
and costs remain in Git and Lloom history. Only VERIFY-RELEASE remains for the final follow-up.
Parent session: `aad26266-17c8-4043-a9eb-8fb1b6c45240`; Codex usage attribution is unavailable.

Parent owns strategy, plan/design, shared contracts, novel safety mechanisms, integration and landing.
Haiku maps precede bounded Sonnet implementation briefs; fresh Opus contexts verify nontrivial work.
Workers use isolated worktrees, explicit-file commits and no merges/pushes. Rebase and run gates
before landing. The project's `--no-ff` convention overrides the skill's fast-forward default.

Preserve user edits in `docs/HOW_TO_USE.md`, `.claude/*` and `.lloom/*`; exclude them from task commits.
The user chose existing secure token setup for this release; browser sign-in follows OAuth app
registration. Do not fabricate credentials or register an external app. Research proposals
for semantic AI repair and user recruitment remain validation ideas, not shipped capability claims.
