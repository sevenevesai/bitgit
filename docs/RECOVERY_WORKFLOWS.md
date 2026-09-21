# Recovery workflows: automatic saves, notes and checks, regression search, interrupted repair

Task-oriented reference for the controls added on top of the base Save & Recover flow
([guide](RECOVERY_GUIDE.md)). Engine behavior and wire contract: [automation](RECOVERY_AUTOMATION.md),
`git-service/src/recovery-types.ts`.

## Automatic saves (Automatic saves tab)

Off by default and per project. Turn the switch on, set whole minutes (1-60), untick files to leave
out, then **Save settings**. Nothing changes until that click; settings go through the `settings`
action, never the app-wide settings store.

- **When it runs:** only while BitGit is open. An app-level timer checks about every 15 seconds,
  one project at a time, for every opted-in project that has a local folder (archived ones too, and
  with the Save & Recover window closed). The engine decides whether files have been unchanged for the
  idle time. BitGit installs no service; nothing happens while it is closed, and no time spent closed
  is reported as checked.
- **What it skips:** a project while its Save & Recover window is open or an action is running for it
  (no queued or delayed changes), and any project with a corrupt settings file or an interrupted repair.
  The engine's vault lock is the final authority.
- **Exclusions:** the same file list as saving. A configured path with no eligible file now (deleted,
  or already skipped) stays configured and is listed with **Remove**. **Re-check current files** is a
  review: files that appeared since the last look are named and are included unless unticked.
- **Retention:** keep everything. The tab shows the version counts, the summed size and the folder.
- **Status and failures:** the tab shows the latest check (reason, time), the latest automatic save
  this session, and any error, with **Run a check now** (**Retry the check now** after a failure).
  Background failures are never toasts. One **Automatic saves need attention** button stays at the
  bottom left of the app while any project fails, listing each error with **Retry now**. After a
  failure BitGit waits 30 s, doubling up to 15 minutes; Retry resets the wait.
- **Corrupt settings:** history stays fully available. A warning appears, the form shows safe defaults
  (off, 5 minutes), and automatic saves stay off until you click **Save settings**.
- **Side effect:** on start BitGit reads each local project's settings, which creates that project's
  empty history folder if it did not exist.

## Notes and checks (History > a version > Notes & checks)

Everything here attaches to that one saved version and never certifies it.

- **Note:** a description (up to 4000 characters, shown as plain text), a result you choose (Not
  tested by default, Worked, Did not work) and an optional PNG, JPEG or WebP screenshot up to 10 MB.
  BitGit keeps its own copy. A screenshot is loaded only when you press **Show screenshot**.
- **Local only:** notes, checks and screenshots are not part of a remote backup, and an imported
  version starts without them.
- **Command check:** type a command, set a time limit (1-600 s, default 120), press **Run check...**,
  read the confirmation, then confirm. Nothing runs on selecting a version, opening the tab or typing.
  The command runs in a **new recovered copy** in a temporary folder with your normal permissions: it can
  use the network and reach any file you can. Your project is not used. Nothing is installed for you, and
  dependency folders are not in saved versions, so put `npm install` in the command if it needs it.
- **Result:** Passed only if the command exited 0 and did not change the copy; exit 0 that changed it is
  Not tested; nonzero, timeout or a start failure is Failed. Output is the last 32 KiB with known credential
  shapes redacted (best effort). The copy is kept and its path can be copied; delete it yourself. A pass
  covers that command on that version only. While a check runs, other actions and closing the window are
  disabled.

## Find a regression (Find a regression tab)

1. Choose an earlier version where the problem was absent (known good) and a later one where it is
   present (known bad). The list is oldest first, ties ordered by ID as the engine does.
2. **Start search.** BitGit suggests one version in between. Recover it into a new folder, or run a check
   on it, then answer **Good**, **Bad** or **Skip** and confirm. Answers cannot be changed in a session;
   use Skip for a result you do not trust. A check or recovery never marks anything by itself.
3. When finished, you get the earliest version seen bad and the latest marked good. Skipped versions
   between them are listed as an uncertain boundary. It assumes one problem that persists once it starts;
   BitGit does not name a file, feature or cause and never changes your project.

The last session ID per project is kept in this browser profile (a pointer only; the history folder is
the authority), so reopening resumes it. You can copy the ID, paste one to resume, or start a new session.
A missing or corrupt session shows the engine's error with **Forget this session**.

## Interrupted repair

If a repair stops part-way (or BitGit closed mid-repair), a banner shows when it started, how many files
it was changing and its safety copy, with **Open safety copy** and **Undo the interrupted repair...**.
Undo is always a click plus a confirmation; opening or refreshing never rewrites files. If you edited an
affected file since, the undo stops with the engine's message, the banner stays, and you keep your edits
and recover the safety copy into a separate folder. Meanwhile saving, repairing and automatic saves are
paused; comparing, recovering copies, notes, checks and remote restore still work. An unreadable repair
record shows a warning and pauses writes to the project. History and recovery into a new folder remain
available; the damaged record is preserved.

## Remote backup status

The saved receipt is authoritative after a reopen. A failed latest check is stored, so the timeline,
Details and Remote backup show the version as **not confirmed** with the error and the older confirmation
time. A local folder path (a bare repository, spaces allowed) is a valid remote. URLs cannot contain
spaces, credentials, `?` or `#`.

## For developers

Unreadable notes or receipts show a warning while saved code stays available to compare and recover
into a new folder. New notes, checks, repair and backup for that checkpoint pause to preserve the
original metadata. An unreadable repair journal also pauses new saves and automatic saving; use
History to recover a safety copy. See [metadata recovery](RECOVERY_DESIGN.md#damaged-local-metadata).

The observer re-reads settings at least every four minutes, including projects where saving was off,
so a harness can enable saving while the app is open. It waits while that project is publishing.

- `src/lib/recovery.ts`: every call goes through `recoveryCall`, which counts in-flight calls per project;
  `projectActivity` and `markWorkspaceOpen` expose that to the observer.
- `src/lib/recovery-automation.ts`: status store, one-pass scheduler, backoff. `AutomationObserver.tsx`
  mounts it from `App.tsx`. The workspace tells it about state and settings changes.
- Panels: `AutomationPanel`, `EvidencePanel`, `CheckPanel` (shared with the regression tab),
  `RegressionPanel`, `PendingRepairBanner`.
- Verification: the worker's browser harness and the parent's actual desktop walkthroughs are
  recorded separately in [RECOVERY_VERIFICATION.md](RECOVERY_VERIFICATION.md).
