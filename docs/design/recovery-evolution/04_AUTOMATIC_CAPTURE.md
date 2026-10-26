# Automatic capture lifecycle and retention

Status: proposed priority 4. Capture should remain dependable through ordinary editing, closing a
window, and long AI sessions. This extends existing opt-in idle saves; it does not silently enable
automation for existing projects. [Current contract](../../RECOVERY_AUTOMATION.md).

## A1 Background lifecycle

Offer an explicit Run in background option, with optional Start at sign-in configured separately.
The first implementation may keep the native app and service alive in the tray after its main
window closes. Move scheduling ownership out of a disposable WebView before claiming that closing
the window preserves capture. A separate operating-system service is not a prerequisite.

Distinguish Close window, Quit BitGit, Pause capture and Disable capture. The tray and project UI
show the same status. Quit ends observation; it must not claim that closed time was protected.
Choose and display an explicit policy for active writes when quitting. Let an already-owned atomic
save finish or cancel at a defined safe boundary, then report the outcome.

Resume after sleep or restart by reconciling settings, source and pending operations. A single
native owner coordinates automatic scheduling while the existing vault lock still serializes
mutations with CLI calls. A second UI instance must not start a second scheduler.

## A2 Idle and task boundary capture

Retain configurable inactivity capture and deduplication. Add explicit boundary requests such as
Before refactor and After task through the [integration contract](08_INTEGRATIONS.md#i2-task-boundaries).
Record boundary type, task label and caller-supplied session reference without importing transcripts.
Do not infer which agent edited a file from a filesystem notification.

Idle capture requires a stable inspected file set. Continuous edits can prevent a coherent save;
show that condition and how long capture has been waiting. Never label an arbitrary timed sample
atomic or force a snapshot through failed stability checks. A before-task integration can request
and await a receipt before its caller starts edits.

Boundary and manual saves may share content but still carry distinct user intent. Define whether
an unchanged boundary request links to the existing immutable snapshot or records an annotation;
in either case return an honest receipt with its content and request identity. No fake new save time.

## A3 Efficient scheduling

Use filesystem notifications as hints, with reconciliation after missed events, overflow, wake,
configuration changes and file renames. Avoid hashing unchanged eligible files on every timer tick.
Preserve full capture validation before publishing. Apply exclusions during enumeration where safe
so deliberately excluded large content does not consume each scan's hashing budget.

Bound concurrent work across projects and serialize work within a vault. Interactive recovery and
explicit saves take precedence over routine observations; fairness prevents a large project from
starving the rest. Use backoff for repeated failures and an explicit retry action.

The current observer pauses whenever that project's recovery window is open. Relax this only after
read operations have a consistent view and mutation ownership is explicit. Reading a checkpoint
need not suspend capture forever; preview/repair and live file validation still coordinate with it.
Archived-project behaviour is configurable and visible, not inferred from hiding a card.

## A4 Visible health and pause states

Persist enabled policy and last successful receipt separately from live worker status. Display
Off, Observing, Waiting for stable files, Saving, Paused with reason, and Needs attention. Show the
last observed time and saved version so stale state cannot look like a running worker.

Reasons include explicit pause, quit, unavailable source, interrupted repair, invalid settings,
credential-independent local error, low disk space and another operation. Present persistent
failures in a shared attention view; repeated background failures should not generate toast storms.
Retry resets backoff but does not weaken coverage or lock checks.

## A5 Storage visibility

Show checkpoint counts by kind, actual vault disk usage, logical captured size and retained evidence
size separately. Git deduplicates identical content, so summing snapshot sizes is not disk usage.
Include temporary check copies and experiment folders with their own locations and ownership.

Provide inspect and reveal-location actions. A storage pressure warning offers reviewable cleanup
choices; it never silently removes named milestones, safety copies or evidence. Pause a save that
cannot complete safely and retain the last good receipt. A partially written object is not a save.

## A6 Explicit retention policy

Keep-all remains the default and existing installations retain it. A later selected retention slice
may offer previewed age, frequency or size policies for automatic checkpoints. Named milestones,
pinned versions, safety checkpoints and versions referenced by active experiments or regression
sessions are protected. Resolve reference dependencies before identifying eligible candidates.

Show exactly which versions would be removed, which are protected, and the estimated versus actual
reclaimable space. Users explicitly enable and scope any recurring prune policy. Changing a shared
profile must not unexpectedly activate deletion for projects that previously kept everything.

Implement a journalled retention operation with exclusive vault ownership and a recoverable holding
period before final object reclamation. Define when undo is possible and when final deletion is
irreversible. Never promise that deleting refs immediately frees all referenced bytes. Remote copies
and imported packages are not pruned by a local retention policy.

Adopting pruning deliberately changes the current keep-all contract. Update its schema, user copy,
authoritative recovery docs and tests together. Until that work is selected and verified, keep-all
continues to be the only supported mode.

## Settings model

Extend the per-project policy with a version, capture triggers, pause behaviour, exclusions and
retention choice. Native lifecycle preferences are separate from individual project opt-in.
[Profiles](09_POWER_USER_CUSTOMISATION.md#p8-project-profiles) can supply defaults with explicit
overrides. Legacy settings migrate to their existing effective behaviour with automation still off
where it was off. Corrupt settings remain visible and fail closed without hiding history.

## Acceptance criteria

- With background mode enabled, close the window, edit a disposable project, and verify an actual
  checkpoint and receipt. Quit explicitly and verify that no subsequent save is attributed to it.
- Sleep, wake and restart during observation. Reconcile missed edits without inventing coverage
  for the closed interval or duplicating a completed request.
- Run UI, background and CLI requests together. Same-vault operations remain safe; other projects
  stay responsive; no worker silently takes over a live operation lock.
- Continuous edits produce a visible wait or capture failure, never a falsely stable snapshot.
- Corrupt settings or an interrupted repair pauses capture while healthy history remains accessible.
- Measure idle CPU, disk reads and capture latency across several projects before and after changes.
- Retention preview and execution agree on eligible IDs; pins, safety references, new concurrent
  references and cancellation are respected. Crash tests cover each deletion/reclamation boundary.
- Disabling a recurring policy prevents future work; it does not erase history or remote data.

## Selection and open decisions

A1-A4 form the dependable-capture slice. A5 can ship independently. A6 is a separate migration and
deletion feature, not a condition for background mode. Choose close/quit behaviour, background owner,
archive defaults, storage budget, retention hold period and backup-retention interaction before
implementing their respective slices. Keep tests and installation choices explicit per platform.

## Implementation map

Current observer: `src/lib/recovery-automation.ts`, `src/components/recovery/AutomationObserver.tsx`.
Engine: `git-service/src/recovery-automation.ts`, `recovery-capture.ts`, `recovery-io.ts`.
Native ownership: `src-tauri/src/main.rs`, `instance_lock.rs`, `app_settings.rs`.
