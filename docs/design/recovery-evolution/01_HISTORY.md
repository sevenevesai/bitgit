# History performance and fault isolation

Status: proposed priority 1. Users must be able to reach healthy saved work as history grows or an
individual record becomes unreadable. The [review](ANALYSIS.md#verified-findings) reproduced slow
history loading and one invalid manifest blocking the complete state response.

## Current behaviour

`RecoveryService.state` resolves and parses every checkpoint sequentially, then returns full
coverage and metadata. The observer also uses state to obtain automation settings.
`CheckpointTimeline` renders every entry. A manifest failure rejects the entire response; receipt
metadata failures already appear on individual checkpoints.

## H1 Lightweight summaries and settings reads

Provide a bounded project summary and an independent settings read. Opening a project card or
checking whether automatic capture is enabled must not enumerate all checkpoint details.
The summary supplies counts, latest checkpoint references, source availability, settings and
repair health, and freshness for the [protection overview](03_PROTECTION_OVERVIEW.md).

Add history pages and a selected-checkpoint detail read. A list row includes identity, original and
display label, creation time, kind, branch context, coverage totals, receipt summary, and record
health. Load file lists, notes, images and diff bodies only when requested. Separate these calls
without making old CLI clients silently receive truncated `state` results.

## H2 Batched reads and a derived index

Batch Git object and manifest reads instead of spawning several processes per row. Build a
reconstructible local index keyed by immutable checkpoint object identity and mutable metadata
revision. The vault remains authoritative. A cache cannot certify file integrity or remote presence.

Update the index after a successful write and reconcile it with vault refs after another process
changes history. File timestamps and notifications are invalidation hints. Preserve a generation
identifier so readers can detect mixed or obsolete pages. Failed index writes must not turn a
successfully published checkpoint into a failed save or cause a duplicate on retry.

When the index is absent or damaged, preserve damaged bytes, serve bounded rebuild progress, and
reconstruct from valid records. A corrupt index must not require deleting the vault. Decide between
a small database and sharded files from measured scale and atomicity needs; avoid adding a second
authoritative snapshot store.

## H3 Bounded history navigation

Load the newest page first. Use stable ordering by creation time and checkpoint ID, a generation
aware cursor, and a visible count or explicit count-unknown state. New saves must not silently move
the selected version. Offer filters for named, automatic and safety checkpoints, and group automatic
entries into collapsible sessions or days without hiding individual versions.

Keep DOM and response size bounded through pagination or virtualization. Preserve keyboard focus,
selection and scroll position when loading more. Search and filters in
[power use](09_POWER_USER_CUSTOMISATION.md#p3-checkpoint-search) query the index, not just loaded rows.
Loading a later page must not restart all earlier work.

## H4 Partial corruption

Return valid rows and explicit problem rows when one ref, manifest, receipt or object is unreadable.
A problem row identifies only validated fields, the affected record, the failure and available next
actions. Do not trust a corrupt label, hide the record, delete it, or invent a recovery result.
Snapshot corruption and unreadable annotations are separate states with different allowed actions.

Users can still inspect and recover an unrelated healthy checkpoint. Recovery validates the selected
snapshot's paths, manifest and bytes again; the index never bypasses that check. Unknown global
vault state can still block operations that cannot be established safe, but must give an actionable
scope-specific error. Metadata repair and destructive quarantine are separate explicit workflows.

## H5 Performance and change detection

Instrument local, opt-in diagnostics for summary latency, first page, details, capture duration,
bytes read and subprocess count. Separate cold index construction from steady reads. This feature
does not authorize telemetry or log upload.

The proposed steady-state target is first-page retrieval within one second for 1,000 checkpoints
on the agreed Windows reference fixture; it is an acceptance target to validate, not measured speed.
Also measure 10,000 entries and large metadata. Summary cost should not scale with full history size.

Source change detection is a related independent slice. Use notifications and conservative caching
to avoid repeated whole-project scans when nothing changed. Reconcile after missed events, sleep,
rename, or clock changes. Capture still verifies the inspected file set and bytes before publication.
Apply configured exclusions early enough to avoid hashing deliberately omitted files while keeping
coverage receipts complete. [Capture scheduling](04_AUTOMATIC_CAPTURE.md) owns that lifecycle.

## Contracts and compatibility

Illustrative new operations are `summary`, `historyPage`, and `checkpointDetails`; their final
schema follows the [shared contract rules](ARCHITECTURE.md). Keep the existing `state` action for
compatible clients until an explicit protocol migration. Independent settings access must preserve
the current corrupt-settings warning and disabled default.

No cache migration rewrites checkpoint commits or existing receipts. Corruption handling is required
on fresh scans as well as cached reads. New data must remain readable with the source folder absent.

## Acceptance criteria

- Reproduce the review fixture, then demonstrate bounded summary and first-page work as history grows.
  Record cold and warm measurements rather than comparing unlike paths.
- Seed one bad manifest, missing object, malformed ref and bad receipt separately. Healthy entries
  remain listed and recoverable; the failed record remains visible with correct restrictions.
- Delete or damage only the derived index. Rebuild preserves vault bytes and selected history.
- Add a checkpoint through another process between pages. Refresh or cursor invalidation avoids
  silent omissions, duplicates and selection changes.
- Verify new-copy recovery still rejects tampered bytes even when the row was previously cached.
- Drive the native UI with many entries; check scrolling, keyboard focus, search and source-loss access.

## Selection and open decisions

H4 can ship as a narrow fix before the index. H1 and H2 should precede broader automatic capture.
H3 can follow the bounded API; virtualization alone does not solve the service bottleneck.
Choose the index format, reference hardware and generation/cursor policy before implementing H2.
Recheck the baseline code and probes when work begins; the measurements describe the reviewed revision.

## Implementation map

Engine: `git-service/src/recovery-service.ts`, `recovery-metadata.ts`, `recovery-automation.ts`.
UI: `src/components/recovery/RecoveryWorkspace.tsx`, `CheckpointTimeline.tsx`,
`src/lib/recovery-automation.ts`. Wire changes also touch `recovery-types.ts` and native validation.
