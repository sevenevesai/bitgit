# BitGit recovery roadmap

## Goal

Deliver the full recovery roadmap authorized on 2026-09-21: milestones, explicit coverage,
comparison and safe recovery, verified remote backups, reliable visual Git, automatic saves,
version-bound evidence, guided regression finding, selective file repair, and a harness CLI.
Audience and rationale: [product review](PRODUCT_REVIEW.md). Contracts and invariants:
[recovery design](RECOVERY_DESIGN.md). Conditional research is implemented as deterministic,
inspectable workflows; no model service is required.

## Wave 1: trustworthy foundation

- [x] CORE: checkpoint capture/list/compare/recovered-copy slice; 10 disposable-repository tests pass.
- [ ] GIT: fix status, clean pushes, service validation, selected commits, safe full sync and conflicts.
- [ ] NATIVE: connect recovery IPC; fix persistent imports/status/results and application lockfiles.
- [ ] Verify foundation with disposable repositories, independent review and native smoke.

## Wave 2: complete recovery workflow

- [ ] REMOTE: verified checkpoint export, remote discovery/import, recovery receipts and tests.
- [ ] REPAIR: selective restoration with safety checkpoint, stale checks, interruption journal and tests.
- [ ] UI: local-project recovery workspace, coverage selection, timeline, comparison, recovered copy.
- [ ] UI: Git file selection/diffs, branch/upstream/freshness, refresh and honest operation outcomes.
- [ ] Verify integrated recovery and remote round trip with disposable fixtures.

## Wave 3: roadmap extensions

- [ ] AUTOMATION: opt-in idle capture, deduplication, visible keep-all retention and JSON harness CLI.
- [ ] EVIDENCE: milestone notes/screenshots, isolated explicit checks, timeout and exact-version results.
- [ ] REGRESSION: persisted good/bad/skip search, isolated candidate recovery and honest boundaries.
- [ ] UI: automatic-save settings, evidence/check controls, regression journey and remote restore.
- [ ] Verify automation, CLI, evidence and regression scenarios with tests and native smoke.

## Completion

- [ ] Fresh verifier reviews implementation, destructive-operation guards and scenario coverage.
- [ ] Resolve findings, run service/UI/native gates and drive the full app with isolated data.
- [ ] Update user/developer documentation, record actual verification limits and commits.
- [ ] Close workers; report available orchestration cost without inventing unavailable usage.

## Ownership and process

Parent owns strategy, this plan/design, shared types, first recovery slice, integration and landing.
Haiku maps precede implementation briefs. Sonnet implements bounded feature slices; a fresh Opus
verifier reviews the recovery safety boundaries. Each worker uses an isolated branch/worktree
outside `S:/BitGit`. Workers do not edit this plan, merge, push, remove worktrees or touch user edits.
Merge order follows the waves; rebase and verify before landing. Project `--no-ff` convention
overrides the orchestration skill's fast-forward default.

Existing user changes: `docs/HOW_TO_USE.md`, `.claude/*` and `.lloom/*`; preserve and exclude from
task commits. Our review docs are included with this plan. No remote publishing is authorized.

## Active roster

Parent is implementing the first recovery slice. Managed worker roster:

| Worker | Tier | Session | Branch / worktree |
|---|---|---|---|
| MAP-FOUNDATION (complete) | Haiku | 887b8629-ec4a-4155-ac71-852b9d87e3d2 | chore/recovery-map-foundation / S:/BitGit-map-foundation |
| GIT | Sonnet | 7f798e4c-8449-4586-a090-82292648ebc7 | feat/recovery-git-reliability / S:/BitGit-wt-git |
| NATIVE | Sonnet | 3ab76b41-0479-41a4-80b8-62eaae33cb11 | feat/recovery-native / S:/BitGit-wt-native |
| RECOVERY-UI | Sonnet | 432d6bb9-795d-4462-a711-f33dce18fa92 | feat/recovery-workspace / S:/BitGit-wt-recovery-ui |

Parent Lloom session:
`aad26266-17c8-4043-a9eb-8fb1b6c45240`; live Codex usage attribution unavailable at kickoff.

## Gates and pickup notes

Root frontend and service builds passed during review; native runtime remains unverified.
Service tests will use Node's built-in runner with disposable repos and isolated Git configuration.
Existing defects are documented with reproductions in `PRODUCT_REVIEW_FINDINGS.md`.
Browser-assisted GitHub authorization requires an application client ID; use existing secure token
setup unless one is already configured. Do not fabricate credentials or register an external app.
