# BitGit product analysis and review evidence

Review date: 2026-09-30. Baseline: v1.1.2 at `de468ac67b01e13b9f940eea066e9e28123c3a36`.
The review combined earlier discussions, source inspection, a native Windows walkthrough, and
disposable service probes. It was not a complete regression audit, a clean-machine installation
test, or market validation. Priorities and proposed designs are indexed in [README](README.md).

## Audience evidence

In the 2026-09-21 discussion, the user described two likely audiences: people who know Git but want
a visual interface without remembering commands, and less technical builders using AI who want
backups against errors and feature regressions during large coding sessions. The user had used
BitGit for that protection, then moved Git automation, history, memory, and commit-cadence work
into their harness and Lloom. This is one former user's account; wider demand remains unknown.
The earlier [audience review](../../PRODUCT_REVIEW.md) records that context and its limits.

| Audience | Job | Design consequence |
|---|---|---|
| Builder using AI with limited Git knowledge | Protect progress and recover after a regression | Explain saved scope, separate local and remote protection, guide version selection and recovery |
| Git-capable developer who prefers visual controls | Inspect and act without recalling commands | Preserve staging intent, expose exact versions and destinations, provide efficient navigation |
| Person managing several projects or clients | Know which projects need attention and which settings apply | Project groups, saved views, protection summaries, explicit policy and account context |
| Harness or Lloom user | Add verifiable recovery to an existing workflow | Reuse the CLI and receipts; link into the UI when visual inspection helps |

The first two cohorts guide the standalone proposal. The others are expansion hypotheses. Local
projects are the initial context; a hosted-only builder without an exported checkout is not yet
served by the recovery engine. Windows behaviour was exercised; no cross-platform claim follows.

## Current capability baseline

| Area | Implemented capability at the reviewed revision | Remaining boundary |
|---|---|---|
| Recovery | Named checkpoints, coverage, compare, verified new-folder recovery, whole-file repair, safety checkpoints and interrupted-repair rollback | No selective semantic repair; default recovered folder has no Git history |
| Capture | Opt-in automatic local saves after inactivity and content deduplication | App must be open; that project's recovery window pauses its observer; keep-all retention |
| Evidence | Notes, screenshots, explicit commands in recovered copies, guided regression search | Evidence remains local; checks require user-supplied commands; regression results are observed boundaries |
| Remote protection | Checkpoint backup, remote-ref verification, discovery and import | Source snapshots are backed up; later evidence and screenshots are not |
| Visual Git | Reviewed whole-file publishing, staged and unstaged diffs, branches, commits, stashes, tags, validation and bulk operations | It remains a separate surface from recovery history |
| Project management | Scanning, search, favourites, archives, descriptions, editor integration and analytics | Main project cards do not expose checkpoint or backup health |
| Integration and delivery | JSON recovery CLI sharing the engine, native credential storage, updater configuration | Node and Git prerequisites remain; convenient editor and harness adapters are not implemented |

Current contracts: [recovery](../../RECOVERY_DESIGN.md),
[automation and CLI](../../RECOVERY_AUTOMATION.md), and [visual Git](../../GIT_OPERATIONS.md).
The original eight-item recovery roadmap was delivered; the ten new priorities develop the next
layer of use rather than proposing those completed features again.

## Verified findings

### History latency

A disposable plain folder contained one small source file. The probe created the first checkpoint
through the service, then seeded valid parentless checkpoint commits with distinct IDs and manifests
sharing the same source tree. It timed the complete `state` dispatch after 1, 25, and 100 entries.
This isolates history enumeration costs; it does not model large source trees or normal save time.

| Checkpoints | Elapsed state call |
|---|---|
| 1 | 184 ms |
| 25 | 11,263 ms |
| 100 | 46,280 ms |
| 100 repeated without UI interaction | 40,268 ms |

Environment: Windows, Node v20.19.2, Git 2.45.1.windows.1. Hardware and filesystem load were not
controlled. These single-run measurements demonstrate a local problem, not a percentile benchmark
or an extrapolation to other machines. Source inspection found sequential per-checkpoint Git calls
in `RecoveryService.state`; each valid entry resolves its ref, reads its manifest, and resolves its
tree. `CheckpointTimeline` renders every entry. [Service](../../../git-service/src/recovery-service.ts)
and [timeline](../../../src/components/recovery/CheckpointTimeline.tsx).

### Partial corruption hides healthy history

The probe added one synthetic checkpoint commit with a deliberately invalid manifest to the same
disposable vault. `state` rejected with `Checkpoint manifest is unreadable`. Recovering the original
healthy checkpoint directly by ID still succeeded and verified one file. This shows that healthy
content can exist behind a failed history response. It does not demonstrate corruption of a user's
vault. Damaged mutable receipt metadata already has a separate, more resilient path.

The durable [results](evidence/history-results.json) and
[reproduction recipe](evidence/README.md) preserve the method without depending on temporary paths.

### First use without GitHub credentials

In the actual Tauri app, an isolated data directory disabled credential access. Creating a project
and advancing to the optional GitHub step displayed:
`TypeError: Cannot read properties of null (reading 'username')`.
The user could skip the step and continue. Native `get_stored_github_credentials` returns an optional
value; `AddProjectModal.loadGitHubRepos` dereferences it without a null check. This is a reproduced
first-use error, not a finding about token validity or GitHub's network API.
[Onboarding source](../../../src/components/AddProjectModal.tsx) and
[native command](../../../src-tauri/src/commands.rs).

### Native workflow observations

- The onboarding order is project name, GitHub, then local folder. The local project card gives
  Create GitHub Repo stronger visual emphasis than Save and Recover.
- A named checkpoint from a plain folder saved two intended files and excluded `.env`.
- After changing the sample source, Compare and repair identified the changed file. The sample
  combined a login regression and a new theme in one file, illustrating whole-file repair's limit.
- History, evidence, regression and automation controls were inspected in the real desktop app.
  A recovered copy through the service verified healthy content in the corruption probe.
- The recovery success UI offers Copy path. Opening the folder or preferred editor is a proposed
  handoff, not an action already present there.

The service build and native development launch succeeded. No production GitHub transport,
installer, comprehensive suite, command-check runtime, or usability participant study was exercised
in this review. The app's existing verification record is [separate](../../RECOVERY_VERIFICATION.md).

## Reasoning lenses and resulting directions

| Lens | User problem considered | Direction retained |
|---|---|---|
| Everyday usability | Recovery happens under uncertainty and stress | Protection facts on cards, guided selection and clear next actions |
| Ambitious | A useful change and a regression can occupy the same file | Separate repair experiment, three-way comparison, reviewed candidate application |
| Novel | People remember working behaviours better than hashes or filenames | Named behaviour observations tied to exact saved versions |
| Power use | Users already have Git and editor workflows | Navigation, comparison, bulk protection actions and narrow integrations |
| Customisation | Projects have different capture, backup and validation needs | Reusable profiles, explicit overrides and saved views |
| Speed | Frequent saves increase both history and background work | Indexed summaries, bounded lists and efficient change detection |
| Architecture | More concurrency can weaken existing safety | Shared contracts, request-scoped credentials, operation ownership and stable identity |
| Adoption | Value appears only after a successful recovery | Local-first setup, prerequisite guidance and an initial recovery rehearsal |

## Priority rationale

The [ranked catalogue](README.md#priorities-and-feature-coverage) preserves all ten recommendations.
History reliability and onboarding have direct evidence. Protection visibility follows from the
primary job and observed UI. Automatic capture, guided recovery and portability close documented
capability gaps. Behaviour history, adapters, customisation breadth and selective repair need
validation of demand and usability before broad investment.

Recommended first selection: history performance and fault isolation, local-first onboarding, and
project protection facts. Capture lifecycle and recovery guidance follow. Individual integration
or customisation slices can move earlier when a real workflow justifies them.

## External reference context

Checked 2026-09-30: [Claude Code checkpointing](https://code.claude.com/docs/en/checkpointing)
tracks editor-tool changes and documents limitations for shell and external edits.
[GitButler operations history](https://docs.gitbutler.com/features/timeline) records snapshots around
major operations and supports restoration. These establish overlap with checkpointing, not demand
for BitGit or a claim that competitors lack every proposed feature. Recheck them before positioning
a later release.

The differentiation hypothesis is durable recovery across tools, understandable coverage, and
evidence for choosing and validating a version. A broader agent runner, enterprise administration,
PR management suite, and additional productivity dashboards are not selected by this analysis.

## Validation needed

Observe both main cohorts protecting a project, introducing a mixed regression, selecting a version,
recovering it, and explaining exclusions. Compare recovery success, time to resume useful work,
and dependence on assistance. Test voluntary reuse before interpreting interest as demand.
[Validation](VALIDATION.md) defines the proposed tasks and engineering evidence to collect.
