# BitGit recovery evolution design index

Status: proposed options for later selection. Recorded 2026-09-30 against v1.1.2 at
`de468ac67b01e13b9f940eea066e9e28123c3a36`. Creating these specs does not select a release scope or
authorize implementation, background services, uploads, command execution, or data deletion.

The product direction is dependable recovery for people building with AI: understand what is
protected, find the right version, and recover useful work. This collection preserves the review
and develops all ten priorities into independently selectable features.

## Read and select work

Start with [analysis and evidence](ANALYSIS.md), then choose a feature below. Each spec describes
the current gap, proposed behaviour, implementation boundaries, acceptance criteria, and unresolved
choices. Subfeature identifiers such as H1 and P6 are stable references for selecting smaller work.
They are not implementation tickets or completed work.

The [shared architecture](ARCHITECTURE.md) owns cross-feature contracts. Existing behaviour remains
defined by the [recovery design](../../RECOVERY_DESIGN.md),
[automation contract](../../RECOVERY_AUTOMATION.md), [Git contract](../../GIT_OPERATIONS.md), and
[native contract](../../NATIVE_RECOVERY.md). When a selected feature changes a current contract,
update that authoritative document as part of implementation; this proposal does not override it.

## Priorities and feature coverage

Priority reflects expected impact and dependencies, not a promise to implement every item in order.
Effort is relative to the existing app: S is a narrow change, M spans a workflow, L adds lifecycle or
storage work. Confidence describes the problem evidence, not an estimate of market demand.

| Rank | Design | Selectable subfeatures | Effort and confidence |
|---|---|---|---|
| 1 | [History performance and fault isolation](01_HISTORY.md) | H1 lightweight summaries; H2 batched reads and derived index; H3 bounded timeline; H4 partial corruption; H5 profiling and change detection | M; high, reproduced |
| 2 | [Onboarding and first recovery](02_ONBOARDING.md) | O1 local folder flow; O2 first save and rehearsal; O3 credentials; O4 prerequisites and runtime packaging; O5 product descriptions and accessibility | S to L by slice; high for current friction |
| 3 | [Protection overview](03_PROTECTION_OVERVIEW.md) | D1 protection facts; D2 coverage and freshness; D3 attention filters; D4 primary actions and shared navigation | M; high for missing visibility, usability to validate |
| 4 | [Automatic capture and retention](04_AUTOMATIC_CAPTURE.md) | A1 background lifecycle; A2 idle and task boundaries; A3 efficient scheduling; A4 health and pause states; A5 storage visibility; A6 retention | L; high for lifecycle gaps |
| 5 | [Guided recovery and validation](05_GUIDED_RECOVERY.md) | G1 intent-based entry; G2 version selection; G3 recovery handoff; G4 regression guidance; G5 check recipes; G6 return to pre-repair work | M to L; medium to high |
| 6 | [Portable recovery context](06_PORTABLE_RECOVERY.md) | B1 selected export package; B2 metadata backup revisions; B3 verified import; B4 restore rehearsal; B5 external requirements | L; high for metadata portability gap |
| 7 | [Behaviour history](07_BEHAVIOUR_HISTORY.md) | E1 named behaviours; E2 exact-version observations; E3 last observed working lookup; E4 assisted suggestions | M pilot, L with assistance; demand unvalidated |
| 8 | [Editor and harness integrations](08_INTEGRATIONS.md) | I1 packaged CLI; I2 task boundaries; I3 opening exact versions; I4 repair briefs; I5 optional adapters | M; integration demand to validate |
| 9 | [Power use and customisation](09_POWER_USER_CUSTOMISATION.md) | P1 command palette; P2 navigation; P3 search; P4 saved views and groups; P5 preferences; P6 richer diffs; P7 bulk save and verification; P8 profiles; P9 milestone annotations; P10 account and editor context | S to L by slice; mixed evidence |
| 10 | [Experiments and selective repair](10_EXPERIMENT_REPAIR.md) | X1 separate experiment; X2 three-way comparison; X3 selected hunks and files; X4 candidate checks; X5 reviewed application and recovery; X6 optional syntax or AI assistance | L; research hypothesis |

## Recommended sequence

1. Select a release around H1-H4, O1-O3, and D1-D4. These address observed reliability,
   performance, and first-use friction. Runtime bundling O4 is a separate packaging decision.
2. Add reliable capture lifecycle and guided recovery, choosing A and G slices explicitly.
   Efficient history reads precede a large increase in automatic checkpoints.
3. Add portable context B when local recovery is established. I1-I3 can ship independently when
   a real harness or editor workflow needs them.
4. Pilot E and X with users before broad investment. Select P slices alongside other work when
   they shorten a demonstrated workflow; adopting the entire customisation spec is unnecessary.

## Dependencies

- D needs H1 summaries; A benefits from H2 and needs the operation ownership contract.
- G can first compose existing actions. Its recipes are reused by E, I, and X.
- B versions evidence and annotations; it does not require background capture or AI.
- I builds on the existing CLI. Durable request receipts become necessary for retrying writes.
- P8 profiles reuse A policies, B destinations, G recipes, and native account references.
- X needs verified immutable inputs, G checks, and the existing repair safety protocol. E improves
  version choice but is not required for a deterministic repair candidate.

## Adoption and completion

For selected work, record the chosen subfeatures, unresolved decisions that must be settled, and
acceptance checks in the active implementation plan. Leave unselected options here as proposals.
Use [validation and research](VALIDATION.md) to choose checks and participant tasks. Completed work
belongs in Git history and the authoritative implementation docs; avoid turning this index into
a permanent execution log.

The previous [recovery roadmap](../../RECOVERY_PLAN.md) is complete. This collection is a new
optional design catalogue, not a reopening of that completed scope.
