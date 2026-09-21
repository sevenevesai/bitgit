# Recovery verification

This is the implementation evidence record for the recovery roadmap. Final landing remains
pending the complete review and both UI integration gates; see [the plan](RECOVERY_PLAN.md).

## Parent checks observed

- Service: 131 tests passed on the integrated tree before the last tag-race regression. That added
  regression was observed failing before the fix and passing after it; final suite count is 132.
- Native: 85 tests and `cargo check` passed after damaged-cache preservation and direct replacement.
- Earlier UI build passed. Extension and visual-Git UI builds and native journeys are pending.
- The independent foundation review found H1/H2/M1/M2/M3/M4/L1. Corrections are in the candidate;
  [the original report](RECOVERY_FOUNDATION_REVIEW.md) refers to its frozen earlier snapshot.

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
isolated vault root. These last checks establish the backend/native boundary, not the extension UI.

## Known verification boundaries

- GitHub authentication/network behavior was not exercised; local bare remotes tested Git transport.
- A screenshot file-symlink rejection case could not create the link on Windows (EPERM); it is
  logged by the suite. Other path/link cases ran. POSIX process-group cleanup was not run here.
- Check commands have normal user permissions. Windows Job Objects manage ordinary descendants;
  external-service or scheduled-task launches are outside that process boundary.
- Remote checkpoint backup carries saved source; later local evidence/screenshots are not included.
- No participant usability study, semantic AI repair, browser OAuth registration or release signing
  is claimed. Recovery covers eligible source, not databases, dependencies or deployed services.

## Documentation preservation ledger

The root `CLAUDE.md` was reduced from 157 lines / 5,624 bytes to 50 lines / about 3 KiB.

| Earlier content | Disposition |
|---|---|
| Purpose, stack, build/dev/service/Rust commands | Kept in root; updated recovery purpose and added actual test command. |
| Port recovery commands and kill-all-Node suggestion | Replaced with process ownership checks; global kills can terminate other projects and sessions. |
| Architecture table, key files, command/IPC wiring and UI conventions | Moved to `DEVELOPMENT.md`; root links it. |
| Problem-first investigation, logging, iteration, graceful recovery, avoiding overengineering | Kept in `DEVELOPMENT.md`; descriptive session anecdotes omitted because they impose no requirement. |
| Atomic cache writes, backups, recovery, validation | Root invariant plus authoritative `NATIVE_RECOVERY.md` and development pointers. |
| Pre-sync limits, warnings, ignore UI and failure remedies | Kept in `GIT_OPERATIONS.md` and `DEVELOPMENT.md`; added explicit selection and fail-closed rules. |
| No force push, `--no-ff`, auto-commit format | Kept in root; branch retention clarified. |
| Credential storage, Settings token validation, scopes and GitHub scope preselection | Kept in root and development workflow. |
| Implemented features and potential enhancements | Current features in README; prior product ideas remain there as inactive proposals. |
| Production-ready/current-daily-use claims | Removed: implementation tests do not establish those claims, and the user said they no longer use it. |

The active plan preserves the entire authorized scope, remaining gates, worker ownership,
user-edit exclusions, no remote-publish authorization and the GitHub client-ID decision. Completed
implementation detail moved to Git history and this verification record. User changes in
`docs/HOW_TO_USE.md` and local harness/configuration files were left intact.
