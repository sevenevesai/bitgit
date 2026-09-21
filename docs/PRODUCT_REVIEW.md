# BitGit audience and feature review

Research date: 2026-09-21. Code reviewed at `14b6aa6` plus the working tree.
See [implementation findings](PRODUCT_REVIEW_FINDINGS.md) for builds, reproduced failures, and
source references. Broader demand remains unvalidated; only the user's own usage history was available.

## Recommendation

Validate BitGit as a visual save/compare/restore tool for builders using AI who cannot confidently
recover with Git. Git-capable developers who prefer visual controls form a second cohort.

The user previously relied on BitGit to preserve milestones before large AI sessions and recover
from regressions. They replaced it with Git automation in their harness and Lloom's project history,
memory, insights, and commit-cadence management. That is evidence from one former user, not market
validation. Lloom's capabilities here come from that description, not a code audit.

Prioritize a focused recovery prototype, potentially reusable inside Lloom, before a broader revival.
Proposed promise: "Save a working version. Experiment. Get back to it when something breaks."

## Audience and product boundaries

| Cohort | Job and required experience | Priority |
|---|---|---|
| Builder using AI with limited Git knowledge | Save recognizable milestones, understand where they are stored, and recover without losing later work. | Primary standalone hypothesis. |
| Developer who knows Git but prefers a UI | Inspect exact refs, staged changes, destinations, and outcomes; preserve existing Git workflow. | Secondary; test alongside novices. |
| Freelancer with several projects | Keep clients, accounts, and project protection organized. | Expansion after recovery works. |
| Established harness/Lloom user | Obtain verifiable recovery or occasional visual inspection; already gets Git automation and insights elsewhere. | Integration cohort. |

Hosted-platform users may already have rollback and no local checkout. Test willingness to install
a companion; initially recruit people with local projects or exported code. Windows is this review's
execution context; macOS/Linux release scaffolding exists but was not validated.

Use progressive disclosure: Save checkpoint, Back up, Compare, Restore; Git details expose exact
refs, selected files, and remotes. Both views describe the same operation. Keep local save, remote
backup, and integration distinct.

## Role-play: the situations worth designing around

| Scenario | User's thought | Ideal journey and current gap |
|---|---|---|
| S1: Before a large AI session | "Login works. Save it before I ask for billing." | Name a milestone and inspect captured scope. Current commits have messages, but no milestone/recovery journey. |
| S2: Regression after hours of work | "Billing was added, but login broke. Keep today's attempt too." | Preserve current work, open the old version separately, compare, then restore. History/stashes lack this guided journey. |
| S3: Keep useful changes | "Keep the styling; undo the authentication regression." | Inspect a selective repair and its dependencies, test it, retain both originals. File diffs alone cannot identify feature boundaries. |
| S4: Forgot to save | "Did anything capture the version before it broke?" | Automatic local checkpoints at configured boundaries, grouped into sessions. Current status polling saves no source history. |
| S5: End of day / lost laptop | "Could I recover this on another machine?" | Distinguish local save, remote copy, and recovery check. Current push/status outcomes can mislead. |
| S6: First backup | "Which files matter?" | Import, inspect coverage, preserve lockfiles, screen secrets. Current import persistence and file defaults have gaps. |
| S7: Git-capable developer | "I staged half a file. What will this actually do?" | Show selection, branch/upstream, destination, and result. Publishing currently stages everything and drops behind state. |
| S8: Harness user | "Create a recovery point before this refactor; return its ID." | A narrow API supplies an inspectable receipt; open the UI for recovery. Validate whether Lloom still needs this. |

## What already exists, and what the frontier suggests

These reference designs establish feasibility and overlap, not demand for a separate BitGit app.

| Reference | Verified approach and lesson |
|---|---|
| [GitHub Desktop](https://docs.github.com/en/desktop/making-changes-in-a-branch/committing-and-reviewing-changes-to-your-project-in-github-desktop) | File/line selection and visual commit review: baseline expectations. |
| [Claude Code checkpoints](https://code.claude.com/docs/en/checkpointing) | Prompt-level code/conversation rewind has shell/external-edit limitations. Test durable coverage across tools and sessions. |
| [Replit checkpoints](https://docs.replit.com/features/version-control/checkpoints-and-rollbacks) | Logical milestones restore code/context; development-database restore is optional, production recovery separate. Make coverage explicit. |
| [GitButler history](https://docs.gitbutler.com/features/timeline) | Snapshots before major operations and local restoration. Give recovery a primary interface. |
| [restic restore](https://restic.readthedocs.io/en/stable/050_restore.html) / [checks](https://restic.readthedocs.io/en/stable/045_working_with_repos.html) | Targeted and selective restores, previews, repository checks. Borrow verification; evaluate an existing engine for broader file backup. |
| [Cursor worktrees](https://cursor.com/docs/configuration/worktrees) | Isolated checkouts for alternative attempts. Try old milestones beside current work. |
| [Git bisect](https://git-scm.com/docs/git-bisect) | Locate changes through good/bad observations or a test command. Foundation for guided regression finding. |
| [Git merge-tree](https://git-scm.com/docs/git-merge-tree) / [Mergiraf](https://mergiraf.org/) | Merge rehearsal and syntax-aware conflict assistance. Components for inspectable selective recovery. |

[GitKraken Launchpad](https://help.gitkraken.com/gitkraken-desktop/gitkraken-launchpad/) and
[Graphite](https://graphite.com/docs/get-started) already cover repository/PR overview and review
workflows. These expansion areas also overlap with the user's Lloom replacement.

The 2025 Stack Overflow survey reports 46% distrust versus 33% trust in AI-output accuracy.
That broad, self-selected sample supports investigating verification, not a BitGit demand claim.
[Survey](https://survey.stackoverflow.co/2025/ai).
[DORA](https://dora.dev/capabilities/working-in-small-batches/) recommends small, verifiable changes
as AI increases code volume.

## Ranked opportunities

Effort is relative: M = a bounded workflow across layers; L = substantial state/lifecycle work.
Priorities reflect the stated recovery job, consequences of failure, and implementation dependencies.

### 1. Named milestones and local checkpoint history — First, L; necessary

Let users save "Login works" or "Before billing refactor" and browse a visual timeline. Each entry
records time, included content, branch/ref context, and whether it is merely saved or was checked.
Keep manually named milestones distinct from frequent automatic saves.

Start with explicit checkpoints. Then add opt-in local snapshots after inactivity or a harness
boundary. Retain them by a visible policy; report incomplete captures when files change during
saving. Capture eligible untracked source too. A checkpoint must preserve a coherent selected
snapshot without unexpectedly moving the developer's branch or changing their staging selections.
Serves S1, S4, S7.

### 2. Guided recovery with "open a copy" — First, L; necessary

Make Restore a first-class workflow: choose a milestone, preview additions/replacements/deletions,
preserve current work, and default to opening a separate recovered copy. Allow in-place or selected
file restoration only with an accurate plan and a recovery point for the current state.

Show whether dependency setup or other steps are still needed before the recovered app can run.
Support recover-forward after choosing the wrong milestone. Test interrupted restore and files
created since the selected checkpoint. A restore is successful when the selected state is recovered
and the previous attempt remains retrievable. Serves S2, S3. Reuse Git/worktree capabilities and the
restore-preview patterns above.

### 3. Verified remote backup and a coverage overview — First, M/L; necessary

Replace a blanket green state with concrete facts: "Saved on this PC", "Copied to GitHub", and
"Recovery checked", each with a version/time. A failed or stale remote check must stay visible.
A protection overview across existing project cards can highlight work newer than the last checkpoint
or remote copy without recreating a full analytics product.

Back up selected checkpoints without merging feature branches or deleting them. Offer a private
repository for new backups and explicitly show existing-repository visibility. Protect secrets and
large assets using content checks such as [Gitleaks](https://github.com/gitleaks/gitleaks), outgoing
history inspection, and intentional exclusions. Preserve application lockfiles.

Show source/config/assets included, content excluded, and any external state outside coverage.
Local history does not protect against disk loss. GitHub code history does not automatically restore
databases, hosted services, credentials, or a deployed app. Give users a coverage receipt that answers
those questions in ordinary language. Serves S5, S6.

### 4. Clear visual Git and guided setup — First, M; necessary

Repair import persistence and make adding a local project useful before GitHub is configured.
Replace manual token friction with browser-assisted sign-in when the core works; GitHub documents
[device flow for desktop clients](https://docs.github.com/en/apps/creating-github-apps/writing-code-for-a-github-app/building-a-cli-with-a-github-app).

Extend the existing commit modal with real file selection and staged/unstaged/untracked diffs.
Display current branch, upstream, ahead/behind, destination, and operation result. Use Git terminology
in the detail view and clear consequences in the guided view. Apply the same validation to single,
batch, and eventual API entry points. Serves S6, S7; source failures are prerequisites to fix.

### 5. Milestones with evidence and understandable comparisons — Next, M; adaptation

A milestone can include a user note, an optional screenshot, and explicitly configured test results.
Example: "Login checked manually; build passed; billing not tested." Pin the evidence to the exact
saved version. Saving a snapshot must not automatically label it working.

Show file changes and an optional plain-language explanation. AI can suggest names or summaries with
links to diffs; users can correct them, and the feature works without a model. This helps a novice
recognize the desired recovery point even when commit messages are unhelpful. Serves S1-S3.
Replit offers a relevant milestone pattern; BitGit's cross-tool execution is the hypothesis to test.

### 6. Guided regression finder — Pilot, L; frontier adaptation

Ask the user for a previously working milestone and a current failing one. Run a selected test in
isolated checkouts, using Git bisect where the history and test support it. Otherwise guide the user
through opening versions and marking whether the behavior works.

Report the first observed failing change, what was tested, and any untestable versions. Nonlinear
history, flaky tests, external data, and dependency drift limit certainty. An AI explanation can
summarize evidence and prepare a repair brief for the user's existing harness. Serves S2; directly
addresses the original regression-protection use case.

### 7. "Keep this improvement, undo that regression" — Explore, L; hypothesis

Help users construct a repair candidate from checkpoints while retaining useful later changes.
Begin with explicit file/hunk selection and conflict preview. Add syntax-aware suggestions or an
AI-proposed patch only after the deterministic workflow is reliable.

Use a separate checkout to compare and run configured checks. A feature can span several files and
depend on later changes; the app must expose that uncertainty. A clean merge is not proof that the
feature works. Preserve both original checkpoints and require inspection before applying the repair.
Serves S3. Merge-tree and Mergiraf are components, not a complete feature-recovery engine.

### 8. A narrow checkpoint service for Lloom and other harnesses — Conditional, M/L

Expose checkpoint creation, listing, comparison, and restore preview through a small local API/CLI.
Return a durable checkpoint identifier, captured scope, and verified storage state. Leave project
memory, insights, and commit-cadence management with the existing harness.

Start only after a real restore round trip works. The integration is useful if Lloom users still need
independent recovery evidence; it is unnecessary if Lloom already meets that need. Avoid importing
private chat histories by default. Serves S8; this is an architectural option, not an implementation
request or a claim about Lloom's current internals.

## Delivery and validation

1. Fix the reproduced sync/status/validation failures and source-traced import issues. Prove a
   Save checkpoint -> open recovered copy round trip with explicit coverage.
2. Pilot named milestones, manual restore, selective Git review, and verified remote copies.
   Add automatic checkpoints after capture and retention are reliable.
3. Decide standalone product versus Lloom component from use. Pilot milestone evidence and
   regression finding; defer selective semantic recovery until users repeatedly need it.

[Engineering constraints](PRODUCT_REVIEW_FINDINGS.md#engineering-choices-for-the-proposed-recovery-workflow)
cover snapshot storage, remote mapping, restore drills, and Git interoperability. Defer a full agent
runner, enterprise administration, PR/stacking management, and more productivity dashboards.

Recruit 6-8 exploratory participants across both main cohorts, including existing agent-rewind users.
Have them demonstrate their last regression before showing the prototype. This tests usability and
need for another app, not market size.

| Experiment | Proposed signal; not measured performance |
|---|---|
| Save, introduce a regression, recover | Correct version retrieved without Git commands or lost current work. |
| Mixed source, untracked file, lockfile, synthetic secret | Intended source recoverable; exclusions understood; excluded data stays local. |
| Network unavailable after local save | User distinguishes local preservation from unverified remote protection. |
| Restore into a fresh folder | Contents match; setup/check results and uncovered state are explicit. |
| Compare with current workflow | Measure recovery success/time and unnecessary commands/app switching. |
| Two-week pilot | Observe voluntary checkpoint reuse and a successful restore drill; record abandonment reasons. |

Revive the standalone app if participants repeatedly prefer its recovery loop. If only harness users
value it, prioritize integration. Demonstrated recoverability is the success measure.
