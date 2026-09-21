# Recovery verification

Implementation evidence for the completed recovery roadmap. The [plan](RECOVERY_PLAN.md) records
landing status; [orchestration costs](RECOVERY_ORCHESTRATION.md) record available usage estimates.

## Parent checks observed

- Service: all 140 tests passed on `9347942`, including remote re-export, damaged metadata recovery,
  redaction expansion, serialized receipt limits and retained-copy reporting after a check.
- Native: all 92 tests and `cargo check` passed on `c357ce9`, including the validation field-name
  boundary regression from `658f524` and scoped ignore-file writes.
- UI and service builds pass after integration. Worker browser evidence: 119 visual-Git assertions
  with recorded native-command stand-ins; 169 recovery assertions forwarding to the real engine.
  Those are browser harness results, separate from the actual desktop evidence below.
- Independent complete review confirmed foundation H1/H2/M1/M2/M3/M4/L1 resolved. Its N1/N2/N4/N5
  corrections are in `cb87ea9`; N3 is a documented lock-recovery limit. Reports name frozen snapshots:
  [foundation](RECOVERY_FOUNDATION_REVIEW.md), [complete](RECOVERY_COMPLETE_REVIEW.md).
- Independent [release review](RECOVERY_RELEASE_REVIEW.md) resolved F1-F6 with 27 focused checks,
  then R1-R4 with 10 focused checks on `9347942`. Parent inspected the resulting UI captures.
  No finding remains open. These checks used a stand-in Tauri boundary and the real validator/engine.

Integration was rebased onto main while retaining merge history; its complete file tree matched
the preserved `archive/recovery-candidate-verified` snapshot exactly. Both builds, all 139 then-current
service tests, 92 Rust tests and `cargo check` passed again on `adf1ba6`. The subsequent small feedback
fix `9347942` passed both builds and the complete 140-test service suite; Rust sources were unchanged.
Main merge `adb23c2` matched the candidate's full Git tree. UI/service builds, `cargo check` and
CLI help then passed from the main checkout. All 15 orchestration sessions are closed, the parent's
smoke ports are free, and the existing `HOW_TO_USE.md` edit retained its pre-merge SHA-256.

All repositories/remotes used for testing were disposable. Tests did not publish to GitHub or use
real credentials. Service tests use Node's built-in runner; Windows shell globs must be expanded
to filenames. The command in [CLAUDE.md](../CLAUDE.md#commands) does that.

## Native smoke

The actual Tauri/WebView2 app ran against `%TEMP%/bitgit-native-smoke-20260921-01`, with isolated
app data and credential access disabled. The parent drove the UI through Playwright attached to
WebView2 and inspected Peek screenshots. The base workflow verified:

1. Save a named milestone from an ordinary folder: source and lockfile included, `.env` excluded.
2. Change code and add an unrelated file. Compare, select one file, confirm repair, and observe
   the safety milestone. Repaired bytes match, unrelated work and excluded files remain intact.
3. Use the native folder picker to recover a new copy. File bytes, exclusions and absence of `.git`
   were checked on disk.
4. Back up to a disposable bare remote and verify the exact ref. Rename the original source away.
   Its saved history remains accessible. A different saved project and fresh vault can discover,
   import and recover the remote checkpoint while the original source is absent.

After restarting with the current backend, actual Tauri IPC created five further milestones and
ran explicit checks in recovered copies. The good version passed; the broken version returned
exit code 3 and failed. Source files and their lack of `.git` were preserved.
An actual one-minute idle observation saved an automatic checkpoint, the next tick deduplicated,
and a separate JSON CLI process returned the same six checkpoint IDs as native IPC using the
isolated vault root. Those initial checks establish the backend/native boundary.

The integrated desktop UI then exercised the remaining journeys with actual Tauri IPC:

- Settings off/on persisted; the app observer produced exactly one automatic checkpoint after a
  real idle minute while another project's workspace was open. An absent exclusion was retained.
- Native screenshot picker attached a PNG; its copied evidence displayed through `evidenceImage`.
  An explicitly confirmed `node check.js` ran on the selected version, failed with exit 3, and left
  current source unchanged. Close was disabled during the check.
- Good/Bad/Skip observations survived a full WebView reload. The completed search named the last
  good and first observed bad versions and displayed the skipped version as an uncertain boundary.
- A fault-injected interrupted repair refused undo over a newer edit without changing either file.
  After restoring that disposable conflict to its pre-repair bytes, confirmed undo restored both
  files and cleared the journal. Source-loss recovery had already passed the base journey.
- A failed remote re-check remained unconfirmed after close/reopen, with the original source absent.
- With both a truncated receipt and repair journal, the desktop still listed history and warned
  about unreadable records. The native picker and Recover copy produced the two expected files;
  the UI reported the unsaved receipt, and both damaged originals were byte-for-byte preserved.
- Visual publishing began with no selected files, showed staged/unstaged diffs, and published only
  the chosen whole `app.txt`. Unrelated `other.txt` remained staged; `.env` and an untracked source
  file were not published. Local-only Refresh really checked the source folder.

Native publishing first exposed the Node `totalStagedSizeMB` versus serde `totalStagedSizeMb`
mismatch. The app correctly refused publication. `658f524` adds deserialize aliases for both size
fields while keeping the frontend names; the same native publish then succeeded with exact bytes.

The release reviewer identified the legacy ignore action's missing filesystem permission. Parent
native smoke confirmed the exact allowlist failure. With `c357ce9`, **Add to .gitignore** used the
saved project's scoped Rust command: existing bytes and CRLF endings survived, `.env` disappeared
from the refreshed selection, and HEAD, unrelated staging, remote ref and `.env` bytes were unchanged.
A read-only `.gitignore` returned a preservation error; making the disposable fixture writable and
retrying added exactly one pattern. Native results and capture: `native-ignore-result.json` and
`native-ignore-fixed.png` in the same smoke directory. A first harness assertion expected two
suggestions instead of the actual one; the corrected full journey passed.

A concurrent native request for another project took 6,067 ms during a five-second check before
the scoped service fix. After it, the request returned in 762 ms while the check continued (6,425 ms
total including startup). The check service stopped and reaped its owned Node child on return.
Probe receipts and Peek captures are retained in the smoke directory; tests used no real credentials.

## Known verification boundaries

- GitHub authentication/network behavior was not exercised; local bare remotes tested Git transport.
- A screenshot file-symlink rejection case could not create the link on Windows (EPERM); it is
  logged by the suite. Other path/link cases ran. POSIX process-group cleanup was not run here.
- Check commands have normal user permissions. Windows Job Objects manage ordinary descendants;
  external-service or scheduled-task launches are outside that process boundary.
- Remote checkpoint backup carries saved source; later local evidence/screenshots are not included.
- An empty ownership lock or orphaned reclaim guard can require manual recovery after a crash;
  [the procedure](RECOVERY_DESIGN.md#damaged-local-metadata) requires stopping all vault users first.
- A crash-left `.gitignore.lock` also requires preserving and moving the abandoned lock after
  confirming no editor owns it; see [development guidance](RECOVERY_DEVELOPMENT.md).
- The user chose secure token setup for this release; browser sign-in follows OAuth registration.
- No participant usability study, semantic AI repair, browser OAuth registration or release signing
  is claimed. Recovery covers eligible source, not databases, dependencies or deployed services.

## Documentation preservation ledger

The tracked root `CLAUDE.md` was reduced from 155 lines / 5,469 bytes to 50 lines / 3,011 bytes.

| Earlier content | Disposition |
|---|---|
| Purpose, stack, build/dev/service/Rust commands | Kept in root; updated recovery purpose and added actual test command. |
| Port recovery commands and kill-all-Node suggestion | Replaced with process ownership checks; global kills can terminate other projects and sessions. |
| Architecture table, key files, command/IPC wiring and UI conventions | Moved to `RECOVERY_DEVELOPMENT.md`; root links it. |
| Problem-first investigation, logging, iteration, graceful recovery, avoiding overengineering | Kept in `RECOVERY_DEVELOPMENT.md`; descriptive session anecdotes omitted because they impose no requirement. |
| Atomic cache writes, backups, recovery, validation | Root invariant plus authoritative `NATIVE_RECOVERY.md` and development pointers. |
| Pre-sync limits, warnings, ignore UI and failure remedies | Kept in `GIT_OPERATIONS.md` and `RECOVERY_DEVELOPMENT.md`; added explicit selection and fail-closed rules. |
| No force push, `--no-ff`, auto-commit format | Kept in root; branch retention clarified. |
| Credential storage, Settings token validation, scopes and GitHub scope preselection | Kept in root and development workflow. |
| Implemented features and potential enhancements | Current features in README; prior product ideas remain there as inactive proposals. |
| Production-ready/current-daily-use claims | Removed: implementation tests do not establish those claims, and the user said they no longer use it. |

The active plan preserves the entire authorized scope, remaining gates, worker ownership,
user-edit exclusions, no remote-publish authorization and the GitHub client-ID decision. Completed
implementation detail moved to Git history and this verification record. User changes in
`docs/HOW_TO_USE.md` and local harness/configuration files were left intact.

At completion, the plan was shortened to its outcome, evidence map and continuing constraints.
The full authorized scope, review/gate completion, local merge, closed-worker status, preserved
user edits, unavailable parent usage and OAuth decision remain. Detailed completed checklists,
intermediate candidates and worker ownership are retained in Git history and linked reports.
