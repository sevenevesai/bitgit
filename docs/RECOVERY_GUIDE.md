# Save & Recover guide

The recovery workspace keeps named copies of a project's files, compares them with the current
folder, and brings files back. Architecture and wire contract: [design](RECOVERY_DESIGN.md),
`git-service/src/recovery-types.ts`. Automatic saves, notes and checks, regression search and interrupted
repair have their own steps in [workflows](RECOVERY_WORKFLOWS.md); this guide covers the whole workspace.

## Open it

Every project card with a local folder has a **Save & Recover** button: local-only projects,
GitHub-linked projects, and projects whose folder has gone missing. GitHub is never required.
The header shows when saved history was last checked; **Refresh** runs a real check. The footer
shows where saved versions live and states that BitGit keeps every one and never deletes one automatically.
Tabs: **Save**, **History**, **Automatic saves**, **Find a regression**, **Restore from remote**.

## What each fact means

A saved version carries separate facts, each with its own time:

- **Saved locally**: BitGit stored a copy of the listed files on this computer.
- **Copied to a remote**: an upload was read back from that remote. The time is a historical record
  of the last successful check, not a live check. If the latest check failed, the version shows as
  **not confirmed** with the error, and the older time is labelled as before that failure.
- **Recovered copy**: a recovered folder's files were checked against the saved version.
- **Notes and checks**: your own records and command results, attached to that one version and kept
  only on this computer (not in remote backups).

A saved version is a copy of files. Nothing tests that the code runs, and databases, credentials,
dependencies, external services and deployment state are outside it. The coverage limits and
warnings the engine reports are shown once beside the file lists.

## Save a version

**Save** tab. A name is required; a note is optional. BitGit lists every file it would include
(untick to leave one out), every file it excludes with the reason, the total size, and the Git
branch and HEAD. **Re-check current files** refreshes the list. Saving sends the previewed
fingerprint and the unticked paths, so a file set that changed after the preview is refused: the
engine's message is shown as is, and **Refresh preview** keeps your name, note and ticks. Saving is
paused while an interrupted repair is unresolved.

## History

Saved versions are listed newest first with a type badge (saved by you, automatic, safety copy),
size, branch, and whether a remote copy (or an unconfirmed one), a recovered copy or notes are recorded.
Select one for **Details**, **Compare & repair**, **Recover copy**, **Notes & checks** and **Remote
backup**. If the project folder is missing, history, details, recovery, notes, checks and remote restore
still work; saving, comparing and repairing show why they are unavailable.

## Compare

Shows what restoring the version over the current files would do: **added** (missing now),
**replaced** (differs), **deleted** (present now, absent from the version), plus the unchanged
count and engine warnings. Open a row for the text before and after; binary and truncated files are
marked. Paths, notes and previews are rendered as text, and control characters are escaped.

## Recover a copy (default)

Choose a parent folder with the picker and a name for a **new** subfolder. The full destination is
shown before you click. The folder must not exist; BitGit refuses a destination inside the project
or its saved history, and the engine enforces the rest. The result shows the file count and the
verification time. The copy is a plain folder: no Git history, no scripts run, nothing installed.
Your working project is untouched. Use **Copy path** to reuse the location.

## Repair selected files

Only this changes current files. In **Compare & repair**, tick the files to restore; none are
preselected. The panel counts what will be overwritten, created and deleted. Confirming saves a
safety copy of all eligible current files first (files BitGit never saves, such as dependency folders,
databases and likely secrets, are not in it; a selected file like that is backed up first or the repair
is refused), then changes only those paths, using the comparison's fingerprint. If files changed since the
comparison, the repair is refused; press **Compare again** and re-review. The result names the safety copy;
**Open safety copy** selects it so you can compare or recover it to go back. BitGit does not group files
into features. A repair that stops part-way shows an **interrupted repair** banner with an explicit undo
(see [workflows](RECOVERY_WORKFLOWS.md#interrupted-repair)).

## Automatic saves, notes and checks, regression search

- **Automatic saves** (off by default, per project): a save after your files stay unchanged for 1-60
  minutes, only while BitGit is open, keep-all retention, exclusions, visible status and failures.
- **Notes & checks** on a version: notes with an optional screenshot, and an explicit command check that
  runs in a new recovered copy with your normal permissions.
- **Find a regression**: pick a known-good and a later known-bad version; answer Good, Bad or Skip for
  each suggested version. The result is a range, not a cause.

Steps, limits and wording for each are in [workflows](RECOVERY_WORKFLOWS.md).

## Remote backup

Never automatic. **Remote backup** prefills the project's GitHub URL, editable. URLs with embedded
credentials are rejected (a plain `git@` SSH user is fine). A folder on this computer (for example a bare
repository, spaces allowed) is also a valid remote. Public or private is shown as **unknown**: BitGit does
not check it. **Back up this version** opens a confirmation naming the destination, file count and
size; only then does **Upload to this remote** run. **Re-check remote copy** is a separate action.
A failed re-check is stored on the receipt: reopening the workspace still shows the version as not
confirmed with the error. Only the saved files are uploaded; notes, checks and screenshots are not.

## Restore from remote

**Restore from remote** works with no local history. Enter a URL, **List saved versions**, choose
one exact reference, **Import selected version** (adds it to history, project unchanged), then
recover it into a new folder as above. An imported version starts without notes or checks.

## Limits

There is no "open folder" button: the Tauri shell allowlist enables `open`, but whether it accepts folder
paths is unverified, so the UI offers Copy path. Every action needs the native `recovery_command`.
Automatic saves need BitGit to be open. Native (Tauri) behavior of the automatic-save, notes, check,
regression and interrupted-repair controls has not been driven yet.

## For developers

- `src/lib/recovery.ts`: `recoveryCall(projectId, request)` invokes `recovery_command` with
  `{ projectId, request }`; the result type follows the action. It also counts in-flight calls per project
  (`projectActivity`). Also `errorMessage`, `redactSecrets`, `validateRemoteUrl`.
- `src/lib/recovery-automation.ts`: background observer for automatic saves (mounted from `App.tsx` by
  `AutomationObserver.tsx`).
- `src/components/recovery/RecoveryWorkspace.tsx`: dialog, tabs, state loading, one-action-at-a-time
  gate (`gate.ts`). Reads queue; a second mutation is refused. Closing is blocked mid-mutation.
- Tabs: `SaveCheckpoint`, `CheckpointTimeline` + `CheckpointDetail` (`CompareView`, `RepairPanel`,
  `RecoverCopy`, `EvidencePanel` with `CheckPanel`, `BackupPanel`), `AutomationPanel`, `RegressionPanel`,
  `RemoteRestore`. Also `PendingRepairBanner`. Shared: `CoverageView`, `Notice`, `TabBar`, `PagedList`,
  `CopyButton`, `format.ts`.
- New actions: add a panel that calls `useRecoveryGate().call(label, request, { mutating })`.
- Integration point: `ProjectCard.tsx` renders `<RecoveryWorkspace project onClose />`.
