# Guided recovery and validation

Status: proposed priority 5. Compose existing recovery capabilities around the user's problem and
provide a useful next step after files are recovered. The current panels already support new-copy
recovery, whole-file repair, regression search, notes and explicit checks.

## G1 Start with the intended outcome

Offer three entry points: Recover a whole version, Find when a problem appeared, and Repair selected
files. Explain their effects before asking for technical details. An advanced route retains direct
checkpoint and Git inspection; both routes use the same engine and safety rules.

Show the selected project, source availability, current operation and pending repair status throughout
the journey. Preserve progress when navigating within the task. Resuming after restart re-reads
authoritative state before allowing a write; an old screen is not a fresh repair preview.

## G2 Choose a recognisable version

Use checkpoint search, date, manual/automatic/safety kind, display labels, notes, screenshots and
recorded check results to help selection. Load evidence previews on demand. Show why a candidate
was suggested, which facts are unavailable, and whether its evidence applies to the desired behaviour.

Display additions, replacements and deletions before repair. Differentiate current work, the saved
version and a separate recovered copy. A timestamp or screenshot can guide the choice but cannot
establish that the entire application worked. [Behaviour history](07_BEHAVIOUR_HISTORY.md) is an
optional later enhancement, not a dependency for this flow.

## G3 Recovery handoff

Default to a new folder outside the source and vault. Show the complete destination and whether it
exists before starting; only a verified published folder yields a successful recovery receipt.
Keep Copy path and add Open folder and Open in preferred editor through validated native commands.

Offer Add as a separate project or Use as an experiment as explicit follow-up actions. Do not
silently repoint the original project, change its remote, initialize Git, or replace its identity.
Record the recovered copy's origin so the user can navigate back to its source checkpoint.

Explain next steps from known requirements: source bytes recovered, dependencies absent, setup not
performed, checks not run. The UI can present a selected recipe but must not execute it on restore.
A moved or deleted recovered folder leaves its historical receipt intact and its current location
unavailable. [Portable requirements](06_PORTABLE_RECOVERY.md#b5-external-requirements) can enrich the
handoff without claiming to recreate hosted services or a database.

## G4 Regression guidance

Retain the current good/bad/skip search and its uncertainty. Help users choose endpoint versions with
evidence and ask about one observable problem. Record the symptom, selected recipe or manual steps,
and environmental assumptions with the search session.

For each proposed candidate, offer Recover copy, Run selected check, then an explicit observation.
A timeout, changing test, unavailable setup or skipped version does not become a definitive bad
result automatically. Make uncertain intervals and the assumption of a persistent failure visible.

At completion, show the last observed good and first observed bad versions, unresolved candidates,
and the relevant comparison. Offer a [repair brief](08_INTEGRATIONS.md#i4-repair-briefs) or an
[experiment](10_EXPERIMENT_REPAIR.md). Do not name a proven cause from temporal order alone.

## G5 Reusable check recipes

A recipe names a reproducible check, its command, timeout, setup requirements and expected scope.
It has a version and content digest. Examples are Build, Test suite or a user-defined login check;
framework detection may suggest a command but must not silently adopt or execute it.

The user reviews and explicitly runs the selected recipe on a specific checkpoint in a recovered
copy. Show setup/install steps in execution order, normal permission scope and possible network
access. No recipe runs as a side effect of opening, saving, importing or recovering.

Store results against checkpoint ID, recipe version, command, run time, exit status, relevant
environment summary and bounded output. Never copy the entire environment or credentials into
evidence. Preserve current cleanup, timeout, redaction and changed-source result semantics from
the [check contract](../../RECOVERY_AUTOMATION.md#explicit-checks).

Classify missing prerequisites or setup failure separately from an observed application failure.
For user-facing checks that need a running preview, define start, stop, timeout and ownership before
adding a managed preview mode. An editor launch alone does not verify a check.

Imported recipes are inert data until reviewed locally. Profiles can reference a recipe, but a
profile update cannot authorize command execution or retroactively alter previous results.

## G6 Return to work from before a repair

After a successful repair, prominently link the safety checkpoint and the recorded affected paths.
Offer Preview return to pre-repair work using the existing safety snapshot. It is a new reviewed
repair operation with a fresh comparison and its own safety save, not an unconditional inverse patch.

If affected files have newer edits, stop and explain the conflict; offer recovery of the safety
version into a separate folder. Interrupted repair remains governed by the current journal and
explicit rollback protocol. A normal completed repair and an interrupted one must not share a
misleading one-click Undo implementation.

## Acceptance criteria

- Starting from each intent, reach the correct existing operation and destination without an
  unexpected source write, Git initialization or dependency install.
- A user can choose the desired milestone using a name and evidence without interpreting hashes.
- Recovery handoff opens the correct verified folder in the configured editor; the original project
  and its checkpoint identity remain available.
- Check results retain checkpoint and recipe identity after recipe edits or restart. Changed source,
  missing setup, timeout, failure and pass remain distinguishable.
- A skipped or flaky regression candidate stays uncertain. Results never assert a root cause.
- Preview return after a completed repair handles newer edits and preserves a fresh safety copy.
- Missing source and damaged annotations still allow healthy snapshot recovery where possible.
- The native picker, keyboard flow, focus, cancellation and operation lifecycle are exercised.

## Selection and open decisions

G1-G3 can initially compose the current engine. G5 adds reusable recipe metadata without requiring
a general workflow runner. G4 and G6 are separate extensions. Choose where journey drafts live,
recipe versioning and editor handoff ownership before implementation. Reusable dependency caches
and automatic preview-server management need separate isolation designs if later selected.

## Implementation map

`src/components/recovery/RecoveryWorkspace.tsx`, `RecoverCopy.tsx`, `RegressionPanel.tsx`,
`CheckPanel.tsx`, `EvidencePanel.tsx`, `RepairPanel.tsx`; `git-service/src/recovery-evidence.ts`,
`recovery-regression.ts`, `recovery-repair.ts`; native editor/folder commands.
