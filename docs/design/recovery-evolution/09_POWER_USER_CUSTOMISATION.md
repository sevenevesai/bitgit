# Power use and customisation

Status: proposed priority 9, divisible into independent slices. Shorten repeated work for visual Git
users and people managing several projects. Existing search, favourites, archives, basic shortcuts,
Git details and editor preferences remain useful foundations. This is not a requirement to build
every customisation option before improving recovery.

## P1 Command palette

Provide searchable actions with their project/version context, availability, shortcut and consequence.
Initial commands cover project switching, Save version, Open history, Compare, Recover copy,
Verify backup, Git details, Open editor and settings. Unavailable actions explain the missing input.

Opening or filtering the palette has no side effects. Selecting a mutating action opens its ordinary
review flow; it does not bypass file selection, destination review, fresh comparisons or service
validation. A command targeting a previously selected checkpoint shows that identity before acting.

Support keyboard-only use, focus return, discoverable shortcuts and conflict handling. Do not steal
typing, input composition, text selection or browser-style shortcuts from editable controls.
Preserve existing shortcuts where their context remains valid; a modal scopes shortcuts to its task.

## P2 Fast navigation

Add quick project switching, direct links to saved versions, back/forward navigation and remembered
project/tab/scroll context. Make recent projects and recent recovery targets available without
changing favourites. Large project lists use bounded rendering as their measured size requires.

Restore navigation state independently of operation state. Reopening a tab must not rerun a save,
check, upload or repair. If a remembered version was removed or a folder moved, show the unavailable
target with a way back to healthy history. A new automatic save must not change the selected version.

## P3 Checkpoint search

Search checkpoint names, display annotations, notes and captured filenames. Filter by date, kind,
branch context, checkpoint tags, backup/check state and optional behaviour observations. Show which
field matched and preserve query context when opening a result.

Query the complete derived index rather than only loaded history rows. Paginate results with stable
ordering; indicate index rebuild or incomplete evidence. Excluded files must not appear as captured
content merely because they are named in coverage. Raw source-content search is a separate option,
not required for the initial search slice.

## P4 Saved views and project groups

Save named combinations of search, protection/Git status filters, favourites, archive visibility and
sort order. Distinguish a dynamic view from a manually selected project group. Examples are Client A,
Recently active, Never saved and Backup needs attention; no hardcoded client taxonomy is required.

Add project labels and simple groups/collections. A project can appear in multiple organisational
groups without gaining several conflicting policy parents. Favourites and archives preserve their
current meaning; moving between groups does not move files or change Git remotes.

Keep selections visible and explicit when filters change. Bulk actions review the actual selected
IDs, including any outside the current filter, before execution. Select all visible and Select all
matching are distinct operations when pagination is present.

## P5 Persistent preferences

Persist light/dark/system theme, comfortable/compact density, preferred project/recovery/Git entry,
saved-view selection and relevant layout choices. Where a table is introduced, column visibility,
order and width can be stored; a configurable table is not a dependency for these preferences.

Expose notification preferences for routine successes and repeated background events. Persistent
failures, paused capture and incomplete operations remain discoverable even when toasts are quiet.
Explain which preferences are global and which belong to a project. Provide reset to defaults
without deleting project history or credentials.

Use versioned native persistence with safe defaults and atomic replacement. The current theme toggle
updates in-memory state; editor preferences already have native persistence. Do not assume every
field in the frontend settings type is already persisted. Preference migration must preserve the
system-theme choice and existing editor configuration.

## P6 Richer comparison

Offer unified and side-by-side line diffs, line numbers, changed-line navigation, text search and
word-wrap controls. Syntax and inline word highlighting are optional display enhancements. Preserve
explicit staged, unstaged and untracked scope in Git views; never flatten partial staging into an
ambiguous combined change.

Allow choosing current files, two checkpoints or supported Git revisions as comparison endpoints.
Resolve symbolic Git references to exact object identities for the displayed result. Show orientation,
branch/ref labels, binary markers and truncation. Renames can be displayed when supported evidence
exists; do not infer file identity solely from similar names.

Keep comparison read-only. File/hunk selection for a repair candidate belongs to
[X3](10_EXPERIMENT_REPAIR.md#x3-selected-hunks-and-files). Current publishing remains explicitly
selected whole files or already committed changes. Partial-file commit/staging would require a
separate Git contract change and is not smuggled into a diff UI improvement.

## P7 Reviewed bulk protection actions

Add Save selected projects, Verify selected backups and Review protection across selection. Reuse
the existing per-project result panel pattern. Before starting, show the exact projects, capture
scope or checkpoint IDs, relevant destinations and unavailable rows. Allow a shared label template
with project/time substitution while showing the resolved labels.

Freeze the reviewed batch membership. Each operation reports succeeded, unchanged, blocked, failed
or skipped with its own receipt and retry action. One project's failure does not conceal completed
work elsewhere. Bound concurrency and preserve same-vault serialization.

Retry reconciles an unknown outcome before creating another checkpoint or upload. Cancellation stops
future starts and requests safe cancellation of active work where supported; it does not roll back
completed saves. Bulk save is not bulk publish. Bulk verification does not silently create backups.
Remote copies of new checkpoints require a separately selected destination and transfer operation.

## P8 Project profiles

A reusable versioned profile can define capture cadence/triggers, exclusions, retention default,
backup destination reference, editor preference and check recipe references. Profiles store no
credential values. A profile helps configure supported actions; it does not create an automation
permission merely by naming an action.

Use deterministic inheritance: built-in defaults, one explicitly assigned profile, then project
overrides. Organisational groups may suggest a profile, but multiple group membership never silently
chooses a winner. Show the effective value and its origin beside each setting; Clear override
restores the inherited value. Preserve absent exclusion paths as intentional configuration.

Preview the impact of applying or updating a profile across projects. Pin assignments to a profile
revision until an update is deliberately applied. Changes to capture scope, upload destination,
retention or check commands need visible review. No profile update enables deletion or executes a
command as an incidental consequence.

Exclusion syntax must be explicit: exact project-relative paths first; reusable glob rules are a
separate supported syntax with safe resolution and a preview of matching files. Rules cannot include
credentials or oversized files blocked by the service, enter nested repositories, or escape the
project root. Explain how new eligible files will be treated.

Profile export/import includes portable settings and inert recipe references. Machine-specific
paths, native account bindings and unavailable editors become unresolved fields to map locally.
Do not silently bind an imported destination to a different account. Profiles share the authoritative
policy models from [capture](04_AUTOMATIC_CAPTURE.md), [backup](06_PORTABLE_RECOVERY.md), and
[checks](05_GUIDED_RECOVERY.md#g5-reusable-check-recipes).

## P9 Milestone annotations

Allow editable display names, checkpoint tags and pins to make history recognisable and retain
important work. Keep original immutable labels and contents accessible; changing a display label
must not rewrite the checkpoint commit or invalidate its existing remote receipt.

Store annotations as versioned metadata with provenance. Pins feed the retention protection set.
Checkpoint tags organise recovery history and are not Git tags. Imported annotations follow the
portable-context conflict rules, and corrupt annotations must not hide healthy saved files.

## P10 Account and editor context

Show the effective account and exact destination before remote actions, especially when switching
projects. A future multiple-account slice requires request-scoped native credential references before
parallel remote work is expanded. Profiles select an account binding without containing its token.

Let projects override the preferred editor and reveal the effective choice. Reuse native argument
validation and the [recovered-copy handoff](05_GUIDED_RECOVERY.md#g3-recovery-handoff). Editor actions
and account selection must not rewrite a project's Git origin or move its recovery history.

## Acceptance criteria

- P1: find and invoke a contextual action entirely by keyboard; destructive actions retain review.
  Shortcuts respect editable controls, modal scope and focus restoration.
- P2: switch projects and return to the same checkpoint/position; reload never repeats a mutation.
- P3: locate an older unloaded checkpoint by label, note and captured filename; index incompleteness
  and unavailable metadata are explicit.
- P4: saved views persist and dynamic membership updates correctly; a filtered-out selection is
  identified before a batch starts; grouping does not change source paths or remotes.
- P5: restart with each theme and preference choice; reset affects preferences only. Quiet toasts
  do not hide persistent errors or operation outcomes.
- P6: staged/unstaged changes, binary files, truncation, resolved revisions and diff direction are
  correct. Viewing a diff leaves HEAD, index and source bytes unchanged.
- P7: exercise mixed outcomes and cancellation across projects, including response loss after save.
  Retry does not duplicate completed work; source publishing is never implied.
- P8: apply a profile, override a field, revise the profile, preview adoption and clear the override.
  Imported account/path references require mapping; blocked capture content stays blocked.
- P9: relabel/tag/pin without changing checkpoint object identity; protected pins survive retention.
- P10: two account contexts cannot replace each other's credentials; editor paths with spaces and
  unsupported targets produce correct native outcomes.

## Selection and open decisions

P1, P2, P5 and small P6 display changes can ship independently. P3 needs H2's index. P7 needs durable
outcome reconciliation for retry. P8 should follow the underlying policy contracts, not invent them.
P9 is useful before retention. Multiple accounts in P10 is an expansion beyond destination clarity.

Choose the default palette shortcut, navigation persistence scope, index search fields, group model,
profile update UX and supported diff endpoints before implementing the affected slices. Validate
compact views and command density with both audiences; power features should remain discoverable
without requiring novices to configure them.

## Implementation map

`src/components/Dashboard.tsx`, `ProjectCard.tsx`, `ProjectDetails.tsx`, `SettingsModal.tsx`,
`git/DiffPreview.tsx`, `git/BulkResultPanel.tsx`, recovery panels and `src/stores/useAppStore.ts`.
Native settings, editor and credential commands own persistence and launches; the service owns policy.
