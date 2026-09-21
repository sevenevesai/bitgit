# Save & Recover guide

The recovery workspace keeps named copies of a project's files, compares them with the current
folder, and brings files back. Architecture and wire contract: [design](RECOVERY_DESIGN.md),
`git-service/src/recovery-types.ts`. This guide covers the base workflow that is implemented.

## Open it

Every project card with a local folder has a **Save & Recover** button: local-only projects,
GitHub-linked projects, and projects whose folder has gone missing. GitHub is never required.
The header shows when saved history was last checked; **Refresh** runs a real check. The footer
shows where saved versions live and states that BitGit keeps every one and never deletes one automatically.

## What each fact means

A saved version carries three separate facts, each with its own time:

- **Saved locally**: BitGit stored a copy of the listed files on this computer.
- **Copied to a remote**: an upload was read back from that remote. The time is a historical
  record of the last successful check, not a live check.
- **Recovered copy**: a recovered folder's files were checked against the saved version.

A saved version is a copy of files. Nothing tests that the code runs, and databases, credentials,
dependencies, external services and deployment state are outside it. The coverage limits and
warnings the engine reports are shown once beside the file lists.

## Save a version

**Save** tab. A name is required; a note is optional. BitGit lists every file it would include
(untick to leave one out), every file it excludes with the reason, the total size, and the Git
branch and HEAD. **Re-check current files** refreshes the list. Saving sends the previewed
fingerprint and the unticked paths, so a file set that changed after the preview is refused: the
engine's message is shown as is, and **Refresh preview** keeps your name, note and ticks.

## History

Saved versions are listed newest first with a type badge (saved by you, automatic, safety copy),
size, branch, and whether a remote copy or a recovered copy is recorded. Select one for **Details**,
**Compare & repair**, **Recover copy** and **Remote backup**. If the project folder is missing,
history, details, recovery and remote restore still work; saving, comparing and repairing show why
they are unavailable.

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
safety copy of all current eligible files first, then changes only those paths, using the
comparison's fingerprint. If files changed since the comparison, the repair is refused; press
**Compare again** and re-review. The result names the safety copy; **Open safety copy** selects it
so you can compare or recover it to go back. BitGit does not group files into features.

## Remote backup

Never automatic. **Remote backup** prefills the project's GitHub URL, editable. URLs with embedded
credentials are rejected (a plain `git@` SSH user is fine). Public or private is shown as **unknown**: BitGit does
not check it. **Back up this version** opens a confirmation naming the destination, file count and
size; only then does **Upload to this remote** run. **Re-check remote copy** is a separate action.
A failed re-check stays on screen and the earlier receipt is labelled unconfirmed. That failure
message is not stored; reopening the workspace shows only the last recorded receipt.

## Restore from remote

**Restore from remote** works with no local history. Enter a URL, **List saved versions**, choose
one exact reference, **Import selected version** (adds it to history, project unchanged), then
recover it into a new folder as above.

## Not in this slice

Notes/screenshots and checks, regression finding, and automatic saves have no controls yet. There
is no "open folder" button: the Tauri shell allowlist enables `open`, but whether it accepts folder
paths is unverified, so the UI offers Copy path. Every action needs the native `recovery_command`.

## For developers

- `src/lib/recovery.ts`: `recoveryCall(projectId, request)` invokes
  `recovery_command` with `{ projectId, request }`; the result type follows the action.
  Also `errorMessage`, `redactSecrets`, `validateRemoteUrl`.
- `src/components/recovery/RecoveryWorkspace.tsx`: dialog, tabs, state loading, one-action-at-a-time
  gate (`gate.ts`). Reads queue; a second mutation is refused. Closing is blocked mid-mutation.
- Tabs: `SaveCheckpoint`, `CheckpointTimeline` + `CheckpointDetail` (`CompareView`, `RepairPanel`,
  `RecoverCopy`, `BackupPanel`), `RemoteRestore`. Shared: `CoverageView`, `Notice`, `TabBar`,
  `PagedList`, `format.ts`.
- New actions: add a panel that calls `useRecoveryGate().call(label, request, { mutating })`.
- Integration point: `ProjectCard.tsx` renders `<RecoveryWorkspace project onClose />`.
