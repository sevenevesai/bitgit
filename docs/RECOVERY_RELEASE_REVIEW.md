# Recovery release review (integrated UI, Git workflows, final fixes)

Snapshot `review/recovery-complete` at cb87ea9. Independent verifier; no source edits. Windows 11,
Git 2.45.1.windows.1, disposable repos, vaults and bare remotes under a session scratchpad in
%TEMP%. No network, GitHub or credentials. Nothing here is a native run.

## Evidence types

- Engine probes: `git-service/dist` called directly with isolated vault roots and bare remotes.
- Browser harness (stand-in): the real `src/main.tsx` app in headless Edge, served by an own
  Vite server on port 5188. Recovery calls go through the real Rust validator (a scratch crate
  compiling `src-tauri/src/recovery_request.rs`) into the real engine. Git commands, dialogs and
  fs are scripted fakes that record every payload. The observer ran under a controlled page clock.
- Not covered: native IPC, Tauri permissions, the parent-owned native journey, and the UI for
  backup, verify, remote list/import and selective repair (engine level only here).

## Earlier findings

| ID | Verdict | Evidence |
|---|---|---|
| N1 | Resolved | Probe: A backs up to r1, source deleted, fresh vault B imports, B re-exports to r2, vault C imports from r2 and recovers byte-exact. An unrelated shallow marker survives; the legacy marker for the exported commit is removed. |
| N2 | Resolved (see F4) | Receipt `""`, `null`, `{"evidence":"x"}`, `{"backup":5}`: history lists it with `metadataError`, compare works, and recover succeeds with `warnings`. Repair (no safety save, no write), runCheck (marker command not run), backup (remote has no refs), verify and evidence refuse. Bytes are preserved. Journal `""`, `null`, `{"version":1}`: `repairJournalError`, history listed, create/autoTick refused, journal preserved. UI labels say "record unreadable", never "not copied". |
| N3 | Documented limit | Manual recovery in RECOVERY_DESIGN.md "Damaged local metadata"; no automatic reclaim. |
| N4 | Resolved in code | `commands.rs:1122` gives runCheck its own `GitService`; `Drop` kills and waits (git_service.rs:517). No Rust read timeout. The native timing is the parent's evidence; not re-run. |
| N5 | Resolved | RECOVERY_AUTOMATION.md:12 matches code. |

## New findings

**F1 Medium (native, inferred from config; code predates the roadmap): Add to .gitignore cannot
write.** `ValidationWarningModal.tsx:98-125` uses `readTextFile`/`writeTextFile` on
`<project>\.gitignore`. `tauri.conf.json` allows only fs readDir/readFile, scoped to
`$APPDATA/BitGit/*`, and the Cargo features lack `fs-write-file`. Harness: the button attempts
read then write. Stand-in: the error toast shows and nothing is published. The native error text
is unverified. VISUAL_GIT_GUIDE.md documents this as working. Latent risk: any read failure is
treated as "no file" (:101-103). Widening write permission alone would therefore overwrite a
.gitignore that could not be read. Remedy: a Rust read-modify-write command like
`apply_template` (commands.rs:992) that refuses on an unreadable file. Otherwise drop the claim.
Parent: confirm in native smoke.

**F2 Low: a stale automatic-save failure never clears once saves are off.** Repro (harness): turn
on, hold the vault lock, and a background tick fails. Release the lock, turn saves off, press
Retry now. The banner keeps the old error, including "next automatic try after …". The log shows
one failed `autoTick`, then only successful `state` reads with no tick.
`noteRecoverySettings`/`applyState` never reset `status.error`, and `hasProblem` counts it even
when disabled (recovery-automation.ts:41-43, 162-176, 323-328). Impact: false attention until a
restart or a later successful tick. Remedy: clear `error` when settings are saved or read back as
disabled.

**F3 Low: a failed interrupted-repair undo does not re-read state.** PendingRepairBanner.tsx:31-38
reloads only on success, yet always says the repair is "still marked as interrupted". Repro:
interrupt a repair (read-only target). A newer edit is refused and kept (correct). Then another
process rolls back. Undo shows "There is no interrupted repair to undo" plus the stale banner,
and Save stays disabled until Refresh. Remedy: `await onChanged()` after a failure too.

**F4 Low: a check can make its own receipt unreadable.** Redaction lengthens the command after the
4000-character bound (recovery-evidence.ts:274). The reader rejects `command` over 4000
(recovery-metadata.ts:16). Probe: a 3973-character command with 496 `://a:b@` is stored at 7444.
The checkpoint then gets `metadataError`, and later notes are refused. Snapshot recovery still
works. Remedy: bound or validate the redacted entry before writing. Inferred, not reproduced:
about 500 entries of escape-heavy 32 KiB output could pass the 20 MiB receipt cap.

**F5 Low (behavior vs guide): collapsing a failed preview unblocks publishing.**
FileChangeRow.tsx:70-73 reports the error only while the preview is open. The guide says the
block stays until retry or unchoose. Pick one.

**F6 Low (docs):** RECOVERY_WORKFLOWS.md:77-79 says an unreadable repair record hides history;
code and probes list history with the journal warning. VISUAL_GIT_GUIDE.md:89 says branch
retention lands separately; it landed (git-operations.ts:1014-1016).

## Workflows verified

Git (stand-in): nothing chosen by default. Conflicted rows are disabled. Partly staged rows show
both labels and the whole-file note. `selectedFiles` is exact. A thrown validation sends nothing.
Blocked review has no publish button. Warnings allow one `allowWarnings` attempt with the same
files; Cancel keeps the selection. Status is re-read after publish, and the outcome stays on the
card. Clean outgoing commits push without selectedFiles. Bulk: dirty gives needs_review, clean
gives published, and Review opens the normal dialog. Merge sends only the ticked branch.
Refresh checks every local project, including local-only Git, and reports problem counts.
Labels: fresh Synced; stale "Not confirmed recently"; unavailable with last-known counts;
behind; diverged.

Recovery (real engine, 47/47 checks): UI save sends the previewed fingerprint. Damaged metadata
and journal flows as in N2. Notes bind to the selected checkpoint. Screenshots load via
`evidenceImage` as a data URL. Checks run only after confirmation, with the exact checkpoint,
command and limit. Regression: a failed candidate check never marks it; skip then bad shows
`inconclusiveIds`; reopening resumes. Absent exclusions are kept on save. Validator
rejections: 0 across 14 actions.

Observer (clock-controlled, 9/9): startup reads every local project and ticks only opted-in
ones. An external opt-in is noticed at the 4-minute re-read. No ticks while the workspace is
open or the project is publishing. Backoff gives 4 attempts in 4 minutes; Retry resets it.
Failures appear in the persistent summary, not toasts. A removed project gets no calls.

## Gates (this worktree, own Cargo target)

- `npm run build` exit 0 (`built in 2.50s`); `npm --prefix git-service run build` exit 0.
- `node --test` on all 7 `tests/*.test.mjs`: `# tests 137`, `# pass 137`, `# fail 0`; logs
  `symlink rejection not exercised: EPERM`.
- `cargo check` exit 0; `cargo test`: `test result: ok. 85 passed; 0 failed`.
- `git diff --check`: clean.

## Verdict

No observed loss of source, index or HEAD, no silent overwrite, and no false saved, verified or
passed claim. No finding blocks recovery of saved code. F1 breaks a documented Git workflow in
the native app (inferred); fix it or retract the claim before release. F2-F6 are low. Native
behavior, GitHub and POSIX remain unverified here.

## Follow-up on c357ce9 (2026-09-21)

The report above is frozen at cb87ea9. This section re-verifies F1-F6 on
`review/recovery-complete` rebased onto c357ce9. It uses the same harness with the same evidence
limits, plus `add_gitignore_patterns` routed to the real `src-tauri/src/gitignore.rs`, compiled
into the scratch crate. Tauri IPC and permissions were not exercised; native proof is the
parent's.

| ID | Verdict | Evidence |
|---|---|---|
| F1 | Resolved | `cargo test gitignore`: 6 passed. Harness: the payload is exactly `{projectId, patterns}`. Existing non-UTF-8/CRLF bytes are kept and the pattern is appended in CRLF. The file list is re-read, with no `sync_project` and no fs API calls. A read-only file gives a visible error, bytes unchanged, no lock left behind, nothing published, and the review stays open. |
| F2 | Resolved | A failure clears when saves are turned off in the tab, stays cleared after a background pass, and clears after an external disable plus Retry (valid disabled read). Corrupt settings stay attention with no ticks. |
| F3 | Resolved | A newer edit is refused and kept; the banner and error stay after the refresh. External rollback then a UI undo gives `repairRollback` err then `state` ok: the banner is gone and Save is enabled. |
| F4 | Resolved | Metadata tests: 5 passed. A redacted command is stored at 4000 with ` [truncated]`, and the receipt stays readable. A 20,874,602-byte receipt plus an escape-heavy check result is refused. Evidence is unchanged; only the check copy's legitimate `recoveredAt` is added, and the receipt stays readable. |
| F5 | Resolved | The block holds through collapse, switching to a scope that loads, an in-flight retry, and a failed retry. A successful retry clears only that file; unchoosing clears it. |
| F6 | Resolved | RECOVERY_WORKFLOWS.md:77-79 and VISUAL_GIT_GUIDE.md:89 now match the code. |

Gates: `npm run build` and the service build exit 0; `cargo check` exit 0. Harness totals:
`followup.mjs all` 27/27 (one run). F1/F5 and F2/F3/F4 also passed in separate runs.

### Remaining observations (low, not blockers)

- **R1:** a size refusal happens after the command has run. The receipt-size check is in
  `appendEvidence`, after execution (recovery-evidence.ts:242 only preflights the 500-entry
  count). Probe: a marker file written by the command exists, yet the UI shows "The check did not
  run" (CheckPanel.tsx:162). The kept working copy's path is not reported. Remedy: preflight
  headroom, or title such errors "The result was not recorded".
- **R2:** when settings turn corrupt after an earlier tick failure, the attention summary still
  shows that old error and its "next automatic try" time. `problemText` prefers `error` over
  `settingsError` (AutomationObserver.tsx:8-12). The workspace shows the settings warning
  correctly.
- **R3:** Reload in the publish dialog keeps a chosen file but drops its failed-preview block
  (rows remount). The guide lists only retry and unchoose.
- **R4:** after an undo fails because another process already finished it, the refreshed state
  is correct, but the error disappears with the banner, without explanation.
- **Limit:** a crash-left `.gitignore.lock` in the project root makes later edits fail with a
  visible error until it is removed by hand.

## Final follow-up on 9347942 (2026-09-21)

Checks the R1-R4 observations above on `review/recovery-complete` at 9347942. It uses the same
harness and the same evidence limits: real components, stand-in Tauri boundary, real Rust
validator and engine. It is not Tauri IPC proof. Service rebuilt before the run. One focused
pass (`final.mjs`): 10/10 checks. An earlier attempt stopped at a harness setup error before R1.

| ID | Verdict | Evidence |
|---|---|---|
| R1 | Resolved | A 20,874,602-byte receipt plus an escape-heavy result: titled "The check needs attention", with no "did not run". It reports "exited with code 0", "could not be recorded" and an existing kept copy path; the command's marker file exists. Evidence is unchanged (106 entries), `metadataError` is absent, and recover still works. |
| R2 | Resolved | A lock failure, then corrupt settings, then Retry: the summary shows only the settings problem, with no obsolete error or retry time, and no ticks run. |
| R3 | Resolved | After Reload, a failed chosen file stays chosen and blocked. A successful retry of the `all` scope, or unchoosing it, clears the block. A new open starts with nothing chosen and no carried error. |
| R4 | Resolved | External rollback then a UI undo gives `repairRollback` err then `state` ok. The banner is gone and a dismissible "Last undo attempt" shows the engine message. After dismissal, Save is enabled. |

No new defect observed. The frozen F1-F6 and R findings above remain as recorded.
