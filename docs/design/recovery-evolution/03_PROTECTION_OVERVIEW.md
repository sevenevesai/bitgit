# Project protection overview

Status: proposed priority 3. Project cards should answer what can be recovered, how current that
knowledge is, and which action would improve protection. Current Git status and recovery facts stay
distinct. The engine already records several facts that are visible only inside recovery details.

## D1 Separate protection facts

Show a compact protection summary on every local project card. Never saved and Unknown are useful
states; an unavailable source must not hide older history. Expand a fact to see its exact version,
time, scope and receipt. Use text and icons as well as colour.

| Fact | Required interpretation | Useful next action |
|---|---|---|
| Local save | A particular checkpoint exists locally; show name, time and kind | Save current version or open that checkpoint |
| Changes since save | Current captured scope matches or differs as of an observation time; otherwise unknown | Review coverage and save |
| Remote copy | A selected checkpoint was confirmed at a particular destination and time; show later failure separately | Back up or explicitly verify again |
| Recovered files | A copy of a particular checkpoint was hash-verified at a particular time | Open receipt or rehearse again |
| Behaviour or check | A specific observation or command result applies to a particular checkpoint | Inspect evidence or run a selected check |
| Automatic capture | Enabled and observing, waiting, paused, stopped, or needs attention | Open status or resolve the blocking condition |

Do not collapse these into a green Protected badge or numerical health score. A successful Git push
does not establish a backup of all uncommitted work. A local bare remote on the same disk does not
establish protection against disk loss. A historical remote receipt is not a live availability check.

## D2 Coverage and freshness

Compare current files using the selected checkpoint's captured scope and coverage policy. A manual
checkpoint may intentionally exclude files: those exclusions must not create a false match for the
whole project or force a permanently dirty state. Show changes within scope and work outside that
scope separately. Changes to coverage policy require a new observation before claiming a match.

Record when source state, remote state and capture health were checked. When the app is closed,
offline, rebuilding its index, or unable to read the source, preserve last-known facts with their
age and mark current state unknown. A newer checkpoint supersedes a card's latest-version summary,
but does not inherit evidence or a remote receipt from an older one.

The summary includes source-unavailable, vault-unavailable, damaged-history and interrupted-repair
states with scoped actions. Use [H1](01_HISTORY.md#h1-lightweight-summaries-and-settings-reads) so
opening a dashboard does not load every checkpoint or screenshot. A summary cache may supply an
immediate historical view while a fresh bounded read runs.

## D3 Attention filters

Provide filters for Never saved, Changes without a checkpoint, Backup needs attention, Automatic
saves paused or failing, and Recovery not rehearsed. Let users save combinations with project
search, groups, favourites and archive visibility through [P4](09_POWER_USER_CUSTOMISATION.md#p4-saved-views-and-project-groups).

Define each filter from facts, not an opaque risk score. Changes without a checkpoint requires a
successful current observation; Unknown belongs in its own attention state. Backup needs attention
distinguishes a missing copy, a failed verification and age relative to the user's chosen policy.
Do not invent an expiry time for a valid historical receipt.

Include behind, diverged and unavailable in the Git status filter alongside existing states.
Filtering recovery state does not imply a Git operation, automatic capture or network request.

## D4 Primary actions and navigation

Give Save version and Recover visible positions on local project cards. Open recovery at the
relevant version and task, not always the default Save tab. Keep Git details and publishing available
to the secondary audience, with exact branch and destination context.

Offer an expanded project workspace as a selectable UI evolution when nested recovery tabs become
limiting. A first slice can retain the modal while adding direct navigation and clear hierarchy.
Preserve project, selected checkpoint and task on back navigation. Long-running work follows
[operation ownership](ARCHITECTURE.md#operation-ownership); changing the layout alone must not make
it safe to close an operation that still depends on the current window.

Analytics remains available. Protection attention belongs in everyday project navigation, so it
does not require adding another productivity dashboard or replacing existing analytics calculations.

## Suggested example

For a project with unsaved eligible edits, a milestone from yesterday and a remote copy checked two
days ago, show those three facts with their distinct versions. Offer Save current version, then
Back up this version after a successful save. Do not report that today's changes are remotely backed
up because some earlier version has a receipt. If the source read fails, replace the current-change
claim with Could not check current files while leaving historical recovery accessible.

## Acceptance criteria

- Render never-saved, local-only, saved-and-changed, source-missing, remotely-confirmed,
  verification-failed and unknown states with correct actions and timestamps.
- A new save does not inherit the previous version's backup or check evidence.
- Intentional exclusions, newly eligible files and changed coverage settings produce distinct,
  comprehensible states; no whole-project protection claim follows from a partial snapshot.
- Git synced with uncheckpointed files is distinguishable from unchanged checkpoint contents.
- Freshness survives restart as historical data without masquerading as a new check.
- Dashboard loading stays bounded across many projects; row actions open the correct checkpoint.
- Keyboard and screen-reader users can identify the facts and actions without relying on colour.

## Selection and open decisions

D1-D2 require H1's summary shape. D3 and direct navigation in D4 can follow independently. A full
workspace replacement is optional. Define freshness presentation and any user-configured attention
thresholds before implementing filters; the default must not invent a guarantee of remote survival.

## Implementation map

`src/components/ProjectCard.tsx`, `Dashboard.tsx`, `git/GitStatusSummary.tsx`,
`recovery/RecoveryWorkspace.tsx`, `src/stores/useAppStore.ts`, and the H1 summary API.
