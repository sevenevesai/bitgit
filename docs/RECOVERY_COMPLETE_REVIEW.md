# Recovery complete review (final, backend)

Snapshot `review/recovery-complete` at 59d3e27 (code 624a1fb). Read-only source review by an
independent verifier. Probes ran from a session scratchpad under %TEMP% against dist builds, Git
2.45.1.windows.1, local bare remotes, Windows 11 only. No network, GitHub or native UI driving.

## Foundation findings (5d4c989)

| ID | Status | Evidence |
|---|---|---|
| H1 | Resolved | Probe of the original repro: a `.env` token commit with tag `v1` was blocked, even with `allowWarnings`. A token in an annotated message was blocked. `pushAllTags` pushed nothing. A clean non-HEAD tag pushed. Pushes `oid:refs/tags/<name>` without force; ref-move race test passes. |
| H2 | Resolved | `GIT~1` import refused. A hashed short name `GI2837~1` for `.git` (passes `safeRelative`) imported and listed by compare. Repair refused it via realpath before any safety save or write; no hook planted. |
| M1 | Resolved | `saveCaptured` runs `readSnapshot` before `update-ref` (recovery-service.ts:126-129); capture excludes unsafe paths. |
| M2 | Resolved | Probe: after `mergeBranches(['feature'])` the remote keeps `feature` and a later push to it. |
| M3 | Resolved | Probe: files named in `info/exclude` and `core.excludesFile` are excluded ("Ignored by Git rules"). |
| M4 | Resolved | Invalid cache files quarantined byte-exact before replacement; unreadable files never replaced; `fs::rename` replaces in place. Behavioral tests read and passing. |
| L1 | Resolved | Probe: `fullSync` with absent origin and a credential returns `blocked`, adds no remote, makes no commit. |

## New findings

**N1 Medium: import leaves the vault shallow, so imported checkpoints cannot be backed up
elsewhere.** `recovery-remote.ts:89` fetches with `--depth=1`, and `repository.git/shallow` then
lists the parentless commit. Repro: A backs up c1 to r1. A fresh vault B imports c1 (recover works),
then `backup` of c1 to r2 fails with "failed to push some refs". A direct push shows
`[remote rejected] (shallow update not allowed)`. B's new checkpoints back up fine. Impact: after a
machine loss, imported history cannot move to a new backup destination, and the reason is hidden.
GitHub behavior unverified. Remedy: once the parentless check passes, drop that OID from the
shallow list, or fetch into a temporary repo and then fetch the verified commit without depth. Also
surface the porcelain reject reason.

**N2 Medium: one damaged receipt or repair journal blocks the whole vault.** `readJson`
(recovery-io.ts:49-54) throws on bad JSON. `state` reads every receipt (recovery-service.ts:183) and
the journal (:89, recovery-repair.ts:27). Repro: a zero-length `receipts/<id>.json` makes `state`,
`compare` and `recover` fail ("Cannot read recovery metadata"), yet the commit is intact. A
truncated `pending-repair.json` makes `state`, `create` and `repairRollback` fail the same way. The
friendlier readJournal message is never reached, so the UI cannot list the safety checkpoint.
Settings damage is handled (`settingsError`). Trigger: file damage. A power loss is plausible
because `atomicJson` renames without fsync and receipts are rewritten on every recover, check,
evidence and backup (inferred, not reproduced). Remedy: load an unreadable receipt as missing
metadata with a visible warning; refuse, never overwrite, updates to it. Report an unreadable
journal as pending (blocking create/repair/autoTick, not state/recover). Consider fsync.

**N3 Low: crash-left lock files block every action until deleted by hand.** recovery-io.ts:96-117.
Repro: an empty `operation.lock` (killed between exclusive create and owner write) fails every
action. A leftover `operation.lock.reclaim` returns "checking its lock. Retry shortly." forever. A PID
reused after reboot counts as alive (inferred). Remedy: treat unparseable or aged lock/reclaim files
as stale; record process start time with the PID.

**N4 Low (native, inferred from code): a check freezes all Git service calls.**
`git_service.rs:104-125` holds the single service mutex from write to response. `runCheck` may take
600 s plus supervisor start. Only `recovery_command` uses `spawn_blocking`; the other async commands
wait inside runtime workers, so status and sync for every project wait. Parent: confirm in native
smoke.

**N5 Low (docs):** RECOVERY_AUTOMATION.md:12 says malformed `settings.json` makes `state` fail;
code, test and probe return `settingsError` with history intact.

Out of scope: `src-tauri/src/app_settings.rs:112-118` still deletes settings.json before the rename
that 624a1fb made direct for the project cache (app settings only).

## Checked, no defect found

- Rust boundary: allow-list = `RecoveryRequest` union = CLI `ACTIONS` (19). Unknown fields
  rejected. Rust sets `vaultRoot` from app data (git_service.rs:213); the source path comes from the
  saved project. The token goes only to the four remote actions and is redacted.
- Automatic saves (CLI, real 62 s wait): disabled reads nothing. Excluded edits neither delay nor
  trigger. Saves after idle, then `unchanged`. Included edits restart the wait. `keep_all` enforced.
  No checkpoint deletion path exists.
- Locks: `state` from a second process during a check gets "Another recovery operation is active";
  dead-PID locks are reclaimed.
- Evidence: screenshot copy unchanged after the original is edited; SVG named .png refused; a
  tampered receipt path is refused by `evidenceImage`.
- Windows checks: suspended create, job assignment before resume, kill-on-close, no breakaway.
  Timeout gives `failed` with `exitCode` null. `start /b` and a hidden PowerShell grandchild give
  `untested`. Zero BitGit-launched survivors right after return (a control process was visible to
  the same query). A clean pass is `passed`; source untouched.
- Regression over separate CLI processes: a skip is replaced; `firstBadId` is correct with the skip
  in `inconclusiveIds`; resume is identical; overwrites are refused.
- CLI: one stdout JSON line, empty stderr. Exit 2 for bad JSON, unknown action, empty, over 1 MiB or
  relative path; 1 for a failed request; 0 for help. Usage errors create no vault.
- Repair: journal first, explicit rollback, stale and unexcluded-coverage refusals (tests).

## Gates (this worktree, own Cargo target)

- `npm run build`: exit 0, `built in 4.21s`. `npm --prefix git-service run build`: exit 0.
- `node --test` six files: `# tests 132`, `# pass 132`, `# fail 0`, `# skipped 0`. One test logs
  `symlink rejection not exercised: EPERM` (no symlink privilege here).
- `cargo test`: `test result: ok. 85 passed; 0 failed`. `cargo check`: exit 0.
- `git diff --check`: clean.

## Verdict and limits

No observed violation of the stated invariants: no source, HEAD or index loss, no silent overwrite,
no false protected, verified or passed claim. N1 and N2 break recovery workflows (re-backup after
import; history access after metadata damage); fix before release. Unverified: POSIX process-group
cleanup; native UI journey and the UI workers' code (not in this snapshot; no product UI verdict);
GitHub shallow-push, fsck and `bitgit-checkpoints/*` workflow behavior; power-loss damage (N2, N3).
Checks are not a sandbox; processes started through external services are outside the contract.
