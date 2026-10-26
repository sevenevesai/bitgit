# Shared architecture for recovery evolution

Status: proposed supporting design for the [ten feature specs](README.md). Keep the existing
React to Tauri/Rust to Node service structure and one recovery engine shared by desktop and CLI.
Choose incremental changes for selected features; this catalogue does not authorize a rewrite.

## Authority and current contracts

The [current recovery design](../../RECOVERY_DESIGN.md),
[automation contract](../../RECOVERY_AUTOMATION.md), [Git operations](../../GIT_OPERATIONS.md), and
[native integration](../../NATIVE_RECOVERY.md) remain authoritative for shipped behaviour.
Checkpoint manifests and saved bytes are authoritative content; mutable evidence and receipts describe
observations and completed effects. UI state, indexes and filesystem notifications are derived views.

Safety checks stay in the service boundary for every caller. A new UI, adapter, profile or queue cannot
bypass capture coverage, path checks, credential/size blocks, explicit whole-file publishing, fresh
repair comparison or the safety checkpoint and journal. Normal save/list/recover actions never gain
implicit command execution. Retention and background scheduling are explicit changes to current
contracts and must migrate their schemas, documentation and user choices together when selected.

## Domain model

| Entity | Purpose and authority |
|---|---|
| Project identity | Durable registry ID with reviewed folder bindings and vault location |
| Checkpoint | Immutable captured content, coverage and origin context; existing IDs and object IDs remain valid |
| Checkpoint annotation | Versioned display name, tags, pins and provenance without rewriting captured content |
| Evidence | Exact-checkpoint observation or command execution, optionally tied to a behaviour and recipe version |
| Protection summary | Derived projection with timestamps and uncertainty; never the source of integrity proof |
| Operation receipt | Durable request identity, intended effect, outcome and authoritative result references |
| Recovery package | Versioned selected content and context with verified digests and provenance |
| Experiment | Managed candidate location and immutable input/revision relationships |
| Policy profile | Versioned defaults and explicit project overrides; no credential values or implicit execution permission |

Use separate revisions for immutable code and changing context. A new note does not create a new
source snapshot; it does create a newer metadata state for indexing and optional backup. Preserve
original labels, evidence, receipts and IDs when changing display information.

## Read model and freshness

Introduce bounded summary, settings, history-page and checkpoint-detail queries as described in
[H1-H4](01_HISTORY.md). Source change observations, remote confirmations, recovered-copy receipts and
check results have independent times and scopes. A single boolean cannot represent protection.

A derived index records its schema version, source generations and metadata revisions. It must be
rebuildable, tolerate per-record failure and invalidate after UI, CLI or background writes. Never
replace source verification during recovery with a cache hit. Preserve corrupt index bytes before
replacement and distinguish rebuilding from no history.

Keep source-observation work separate from vault history reads. Watching a directory only hints
that a new scan is needed; lost events, sleep and renamed paths require reconciliation. Matching
current content must account for the checkpoint's captured scope and exclusions.

## Typed and versioned boundaries

The UI currently imports recovery TypeScript types, while Rust maintains a request allow-list.
Retain strict native and service validation. Define a single versioned wire-schema source or generate
both sides' validators/types to reduce drift; choose tooling when a concrete new action is adopted.

Use structured, redacted errors with code, action, retryability, affected record, completed effects
and recovery suggestions where known. Missing credentials, unknown outcome, unreadable annotations
and invalid snapshot content are distinct cases. The first-use optional-credential bug demonstrates
why native nullability must appear in frontend types.

Illustrative additions such as `summary`, `historyPage`, `checkpointDetails` and operation lookup are
proposed names, not currently accepted API actions. Keep existing action response meanings until a
declared version transition. A legacy `state` call must not silently become a partial page.
Add capability/version negotiation for packaged CLI and adapters before independent client updates.

## Operation ownership

Every mutating request has an explicit owner, scope and request ID when durable retry is supported.
Bind the ID to a digest of validated input. Record accepted/running/completed/failed/interrupted or
unknown state and retain result identities. Reusing an ID with changed input is rejected.

After response loss, query the receipt and actual committed effects before replaying work. A timeout
is not proof that an upload or checkpoint failed. For operations whose external result cannot be
established, report unknown outcome and require reconciliation; do not offer blind automatic retry.

The native host owns long-running work that can outlive a view. UI subscribers can receive bounded
progress and reconnect. Closing a view becomes safe only after ownership, result persistence and
error recovery are implemented. Until then, keep current close restrictions for active mutations.

Define cancellation per operation phase. A queued batch can stop future starts. Capture can stop
before publishing a checkpoint; after publication it reports the completed checkpoint. Repair obeys
its journal and exposes explicit rollback. Check cancellation must stop and account for its process
tree before reporting a terminal result. Remote cancellation may leave a verifiable external effect.

Use the existing vault lock as final authority across UI, CLI and background callers. Keep same-repo
Git commands ordered; unrelated repositories may progress under bounded concurrency. Do not assume
all reads are lock-free: selected reads need a coherent generation, and repair/check lifecycles still
own their protected state. A durable operation registry and one GUI instance solve different problems.

## Credential scope

The reviewed native code forwards a token by mutating service-wide `setGithubToken` state before a
remote recovery request. The [native contract](../../NATIVE_RECOVERY.md#verification-and-limits)
documents a concurrency window in which another request can clear or replace that context.

Carry credential context with the individual native-to-service request or an equivalently isolated
request-scoped client. The frontend and profiles identify a native account binding, never a persisted
token. Do not log, serialize into receipts, or return the credential. Reconstruct scoped authentication
after service restart rather than relying on shared process memory.

Select this change before expanding concurrent remote recovery or multiple accounts. Do not use a
global lock around all repositories as the long-term replacement for correct request isolation.
CLI credential-helper behaviour remains separate from desktop native credential resolution.

## Project identity and folder relocation

The current vault key hashes the normalized absolute source path. Keep legacy vaults readable.
Introduce a registry mapping a stable project identity to vault location and explicit source bindings;
moving a folder must not make existing history appear to vanish or silently merge unrelated projects.

Provide Locate moved folder with a review of the old and new bindings and detected Git context.
Path similarity or a matching remote URL is not sufficient authority to merge histories. Worktrees,
copies and separate clients can share a remote while needing distinct local working-state protection.
Store origin relationships for recovered copies and experiments without repointing the original.

Migration discovers and references legacy vaults before moving any data. Keep a verified backup of
the registry and legacy path mapping. Update UI and CLI resolution together, preserve checkpoint IDs,
and prove history access when both source paths are absent. Physical vault relocation is an independent
explicit action with source/destination validation and verified copy before any removal.

## Storage and portable context

Snapshots, annotations, evidence, profiles, packages and operation receipts have separate schema
versions and bounded serialized sizes. Replace mutable records atomically with validated read/write
schemas; preserve damaged originals and recover valid backups using existing storage conventions.

Portable packages include selected immutable content plus explicit metadata revisions. Imported
commands and instructions remain inert. The package validator applies size, path, digest and reference
checks before publication. Existing code-only backup remains supported; extending it must not upload
new categories of data without selection. [B1-B3](06_PORTABLE_RECOVERY.md) owns the package contract.

Retention must consider pins, active operations, experiments, regression sessions and receipt
relationships before removing local content. Do not garbage-collect objects reachable by retained
versions or assume a remote receipt is sufficient permission to discard a local safety copy.
Temporary check copies and experiments have explicit owners and separate cleanup decisions.

## Runtime and platform evolution

Prefer a tray-owned native scheduler for the first background slice if it meets requirements.
Do not claim reliability while scheduling remains in a closed WebView. A daemon, operating-system
service, new IPC transport or Tauri migration requires evidence of need and its own rollout choice.

Node bundling is a packaging decision with version/update ownership, not a reason to duplicate the
engine in Rust. Verify credentials, process cleanup, instance ownership and filesystem semantics on
each supported platform before extending the Windows evidence to it.

Local diagnostics may expose operation timings, phase, counts and redacted errors on demand. No
telemetry or upload is selected here. Performance evidence must distinguish first rebuild, warm reads,
source scans, Git subprocess overhead, network time and UI rendering before choosing an optimization.

## Migration and compatibility gates

| Change | Required compatibility evidence |
|---|---|
| Summary/index API | Legacy checkpoint/ref bytes unchanged; old state contract retained or explicitly versioned |
| Background owner | Existing disabled policies stay disabled; one owner after restart and a second launch |
| Retention | Existing keep-all persists; pin/reference graph respected; interrupted prune is recoverable |
| Credential scoping | Parallel account contexts cannot cross; restart does not reuse a stale credential |
| Stable identity | Old path-based UI/CLI history remains reachable after migration and source loss |
| Evidence package | Source-only backups still import; unsupported package versions fail safely |
| Check recipes | Existing evidence keeps its original command and meaning; imported recipes never auto-run |
| Experiment repair | Immutable inputs remain recoverable; current source/index preservation and rollback still hold |

## Decisions to make when selecting work

Choose the derived-index format and cursor generation model for H2; native ownership and cancellation
for A1; wire-schema tooling with the first cross-layer extension; registry migration for relocation;
package format and encryption policy for B; and candidate identity/lineage for X. These are unresolved
design choices, not permission gates for unrelated slices. Implementation should record the chosen
tradeoffs with evidence and update the authoritative subsystem contracts.
