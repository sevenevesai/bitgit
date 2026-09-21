# Recovery automation, evidence, regression search and the harness CLI

Extensions on top of the checkpoint vault ([design](RECOVERY_DESIGN.md)). All of them run through
`RecoveryService.dispatch`, so the app (IPC) and the CLI share one lock, one vault and one policy.
Nothing here changes your source files, branch, or Git index.

## Automatic saves (opt-in)

Settings (`{"action":"settings","settings":{...}}`): `automaticEnabled` (boolean, default off),
`idleMinutes` (integer 1–60, default 5), `retention` (must be `keep_all`), optional `excludedPaths`
(project-relative, forward slashes, no duplicates). Unknown keys are rejected. Missing settings use the
defaults. Malformed settings pause `autoTick`; `state` returns disabled defaults plus `settingsError`
so saved history stays available. Saving valid settings clears the error.

Nothing runs in the background. The UI calls `autoTick` on a timer while BitGit is open; a harness
calls it explicitly. Each tick returns `{checkpoint, reason}`:

| reason | meaning |
|---|---|
| `disabled` | Automatic saves are off. The source is not read. |
| `waiting-for-idle` | The selected files changed since the last tick (or this is the first observation), or have not been stable for `idleMinutes` yet. Nothing saved. |
| `saved` | Files were unchanged for `idleMinutes`; a `kind: "automatic"` checkpoint was written (`checkpoint`). |
| `unchanged` | Stable and identical to the newest checkpoint of any kind. Nothing saved. |
| `no-eligible-files` | Every file is excluded or gone. No empty checkpoint is faked. |

The last observed fingerprint and its change time persist in the vault (`automatic-observation.json`),
so ticks from different processes agree. Any settings change (enable, idle time, exclusions) discards
the observation; saving identical settings does not. A clock that moves backwards restarts the wait.
Cadence is the caller's: the wait only ends on a tick, so a save happens at the first tick at or after
`idleMinutes` of stability. Edits made while the wait is running restart it.

Failures throw (nothing is faked as protected): missing/unreadable source, a pending interrupted
repair (undo it first), a file changing during capture. **Retention is keep-all**: manual, safety and
automatic checkpoints are never pruned.

### Exclusions

`excludedPaths` applies to automatic saves only (manual saves keep their own selection). Excluded
files are not saved, and edits to them neither delay nor trigger a save. A configured path whose file
is absent is not an error: it stays configured and is listed in the checkpoint's `coverage.excluded`
with the reason `Excluded by your selection`, the same marker manual selections use, so compare treats
a file that reappears as intentionally excluded. Deleting an included file is captured by absence.

## Evidence

`evidence` attaches a note to one exact checkpoint ID: `description` (1–4000 characters), `outcome`
(`passed` | `failed` | `untested`), optional `screenshotPath`. Entries are append-only, get a unique
ID and time, and never certify the checkpoint. Evidence on one checkpoint never applies to another.

Screenshots must be an absolute path to a regular file (no links, including parent folders), 1 byte–10 MiB,
recognised as PNG, JPEG or WebP by their bytes (SVG and executables are refused whatever the name). The
bytes are copied to `<vault>/evidence/<checkpointId>/<evidenceId>/screenshot.<ext>`, re-read and
hash-checked; `screenshotPath` is that copy. Editing or deleting the original changes nothing.
`evidenceImage` takes `checkpointId` and `evidenceId`, returning a raster `dataUrl` for that saved
entry only. It refuses paths outside that entry's vault directory; callers cannot request arbitrary files.

**Coverage boundary:** evidence and screenshots are local metadata in the vault. A remote checkpoint
backup contains only the saved source snapshot, not evidence added later, and a fresh-vault import
starts without it.

## Explicit checks

`runCheck` (`checkpointId`, `command`, optional `timeoutSeconds` 1–600, default 120) runs only when
requested; save, list, recover and `autoTick` never execute anything.

- The checkpoint is recovered into a fresh folder under the system temp directory
  (`<temp>/bitgit-check-XXXX/source`) and the command runs there via the platform shell
  (`cmd /d /s /c` on Windows). It is **not a sandbox**: the command has your normal user permissions and
  can reach the network and any file you can. Your source folder and the vault are not used as its cwd.
- The environment is yours minus `GITHUB_TOKEN`/`GH_TOKEN`/`GITHUB_PAT`, redirecting `GIT_*` variables,
  and any variable containing the service's GitHub token. There is no stdin.
- Windows checks use a PowerShell supervisor and a Windows Job Object. The shell is created suspended,
  assigned before execution, and its job is terminated on timeout or when descendants outlive it.
  Closing the supervisor also closes the job. Supervisor startup adds time outside the command limit;
  blocked PowerShell or job setup fails the check without running it. This manages ordinary child
  processes, not programs deliberately launching work through external services or scheduled tasks.
  Elsewhere, cleanup targets the command's process group; detached groups are outside that boundary.
  A run with surviving background children or unconfirmed cleanup cannot be recorded as passed.
- Output keeps the last 32 KiB. Known credential shapes (GitHub/AWS/API tokens, private keys,
  `password=`/`token=` values, bearer headers, URL passwords, the service token) are redacted in the
  command, output and description. Redaction is best-effort.
- After the run the copy is compared with the checkpoint. Exit code 0 is `passed` only if no saved
  file was changed or removed and no eligible source file was added. Otherwise the outcome is
  `untested` and the description lists the changes. Nonzero exit, timeout and start failures are
  `failed` (`exitCode: null` for a timeout). Dependency and generated folders follow the normal
  exclusion policy, so writing `dist/` or `node_modules/` does not count. On Windows only content is
  compared, not the executable bit.
- The result is `CheckpointEvidence` (`kind: "command"`) with the redacted `command` and
  `workingCopyPath`, the retained copy. It is left for inspection; delete it yourself when done. It is
  in a temp folder and may vanish. A passed check means that command passed on that checkpoint, nothing more.
- Recovering the copy sets the checkpoint's `recoveredAt`, like any recovery. A check holds the vault
  lock for its whole run: other operations in the same process queue, and other processes get
  "Another recovery operation is active".

## Regression search

`regressionStart` (`goodId`, `badId`) needs two different checkpoints with good saved before bad.
`candidateIds` is every checkpoint from good to bad inclusive in creation-time order (ties by ID);
the session is fixed at that moment and stored in `<vault>/regressions/<id>.json`.

`regressionObserve` (`sessionId`, `checkpointId`, `outcome`: `good` | `bad` | `skip`) records one result.
`nextId` is the lower median of the unobserved candidates between the latest known-good and earliest
known-bad, so a skipped candidate is replaced by its nearest balanced neighbour and is never suggested
again. When none remain, `complete` is true and `firstBadId` is the earliest observed bad milestone.
`inconclusiveIds` lists skipped candidates between the last good and that bad milestone: if it is not
empty the real boundary may be any of them. Observations are never overwritten (repeating the same
outcome is a no-op); marking a milestone good after a bad one, or bad before a good one, is rejected as
a contradiction of the assumption that failures continue once they begin. Flaky tests or external state
break that assumption; the search does not detect it and names no cause, file or feature. `regressionGet` resumes a session
from any process.

## CLI

```
node git-service/dist/recovery-cli.js --repo <absolute project> [--vault-root <absolute folder>]
```

One `RecoveryRequest` JSON object on stdin (max 1 MiB) per invocation; one JSON line on stdout,
`{"success":true,"data":...}` or `{"success":false,"error":"..."}`. Exit 0 = success, 1 = request
failed, 2 = bad arguments, empty/oversized/malformed input or unknown action. Nothing is sent or
changed unless you send a request. No progress output, no daemon, no credential flags: remote actions
use your Git credential helper. `--help` prints the protocol. Also installed as `bitgit-recovery`
(package `bin`); avoid `npm run` wrappers in scripts because npm prints a banner on stdout.

Before a refactor, and a manual milestone with a note (bash):

```
echo '{"action":"create","label":"Before auth refactor","note":"login works by hand"}' \
  | node git-service/dist/recovery-cli.js --repo /work/app
```

PowerShell (here-string avoids argument quoting; ASCII-only requests are safest on Windows PowerShell 5.1):

```
@'
{"action":"runCheck","checkpointId":"<id>","command":"npm test","timeoutSeconds":300}
'@ | node git-service/dist/recovery-cli.js --repo C:\work\app
```

Regression loop: (1) `regressionStart` with the known good/bad IDs; (2) take `data.nextId`;
(3) `runCheck` on it, or `recover` it to a new folder and try it by hand; (4) send `regressionObserve`
with `good`/`bad` (use `skip` for a result you cannot trust: `untested`, timeout, flaky); (5) repeat
until `data.complete`. Every step is a separate invocation; state lives in the vault.
