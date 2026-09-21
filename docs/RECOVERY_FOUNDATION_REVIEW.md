# Recovery foundation review (wave 2)

Snapshot `review/recovery-foundation` at 5d4c989. Read-only review, no source changes. Probes used
`tests/git-reliability-fixtures.mjs` sandboxes under %TEMP% (isolated HOME/config, local bare remotes,
Git 2.45.1.windows.1, no network or project hooks).

## Findings

**H1 Tag pushes skip publish validation.** `git-operations.ts:1465-1481` run `push origin <tag>` and
`push --tags` directly (UI `ProjectDetails.tsx:599,611`); `pushTag` does not validate the name. Repro:
commit `.env` with a fake `ghp_` token; `validateBeforeSync` gives `canProceed:false`, `pushLocal` is
`blocked`, then `createTag('v1')` + `pushTag('v1')` and the remote's `v1:.env` holds the token. Impact:
non-overridable errors (credentials, >100 MiB) reach the remote. Fix: `enforce()` a scan of
`<tag>^{commit} --not --remotes=<remote>` (every tag for `--tags`) first; validate names.

**H2 An imported checkpoint can write into `.git` via the 8.3 alias.** `safeRelative`
(`recovery-io.ts:14-22`) rejects `.git` but not `git~1`; repair writes the path
(`recovery-repair.ts:60-73`). Repro: craft a remote checkpoint (mktree + valid manifest) holding
`GIT~1/hooks/pre-commit`. Victim repo on C: (`dir /x` shows `GIT~1 .git`): `remoteImport`, then
`compare` lists `add GIT~1/hooks/pre-commit`; `repair` returns fileCount 1 and
`.git/hooks/pre-commit` holds the remote bytes. "Select all" (`CompareView.tsx:244`) includes it.
Impact: an untrusted remote plants a hook that runs on the next commit.
Fix: reject Git's `.git` aliases (`git~1`, `.git` plus trailing dots/spaces) in `safeRelative`;
repair refuses targets whose real parent is inside the source's git dir.

**M1 Saves can publish unreadable checkpoints, including a repair's safety copy.**
`update-index --index-info` prints "Ignoring path" and exits 0 for names Git refuses (a `git~1`
component). `saveCaptured` (`recovery-service.ts:107-119`) runs `update-ref` without comparing the
tree to the manifest. Repro: a plain folder with `notes/git~1/todo.txt`: `create` succeeds and `state`
lists it, but `recover`/`compare` throw "Checkpoint tree does not match its manifest". Save A without
that file, add it, repair `app.js`: the repair succeeds and clears its journal, but its safety
checkpoint cannot be recovered, so the pre-repair `app.js` is lost. Fix: before `update-ref`, check
`ls-tree -r` against the entries (or `readSnapshot` the commit); exclude such paths during capture.

**M2 `mergeBranches` deletes the remote branch without checking that it is unchanged.**
`git-operations.ts:1085-1086` check ancestry against the ref fetched at `:1032`, then `push --delete`.
Repro: wrap `pushCurrent` so a second clone pushes `late work` to `feature` just after BitGit's push:
`mergeBranches(['feature'])` returns `['feature']`, the remote has only `trunk`, and neither a remote
ref nor local HEAD contains the late commit. Impact: a collaborator's or agent's commits leave the
remote. Fix: delete with a lease (`push --force-with-lease=refs/heads/<b>:<fetched oid> <remote>
:refs/heads/<b>`, compare-and-delete, no history rewrite).

**M3 Capture skips `.git/info/exclude` and `core.excludesFile`.** `recovery-capture.ts:22-25` list
files through the vault git dir with global config off, so only work-tree `.gitignore` files (and the
XDG default) apply, against `RECOVERY_DESIGN.md:16`. Repro: `git check-ignore` reports
`local-notes.txt` (info/exclude) and `global-ignored.txt` (core.excludesFile); `preview` includes both
and `backup` uploads both to a bare remote. Impact: files kept out of Git (notes, credentials) are
saved and uploaded behind heuristic screening only. Fix: for Git sources, list ignored/untracked files
from the source repo read-only; keep the vault listing for plain folders.

**M4 An unparseable project cache is discarded, then overwritten.** If `projects.json` and `.bak` both
fail to parse, `project_cache.rs:92-129` returns an empty list. Step 5 (`:172`) skips the backup of an
invalid main, step 6 replaces it, and the next write overwrites `.bak`. Repro (test-only scratch
crate copy): write an unknown status variant into both files: `load()` returns 0 projects, and after
two upserts neither file keeps the original. Trigger: this branch writes
`local_changes`/`not_connected`/`behind`/`diverged`/`unavailable` (`models.rs:90-106`), which the
pre-branch enum (`rename_all = "lowercase"`, no aliases) rejects. By the serde attributes (old binary
not run), running an older build empties the dashboard and one edit starts erasing the list. Fix: move
an unparseable file aside before writing; retry read errors before restoring `.bak`.

**L1** `fullSync` adds an absent `origin` before fetch and validation (`git-operations.ts:1142`), so a
blocked sync still leaves the remote. `GIT_OPERATIONS.md:42` says after validation (true only for
`pushLocal`).

## Checked, no defect found
Capture keeps index/HEAD. Stale preview/repair are refused. Recovery checks collisions, links and
containment before a staged rename. Repair refuses excluded targets, journals first, and rollback keeps
new edits. Import rejects parent commits and forged manifests, verifies bytes, never replaces an ID.
Backup never forces and verifies via `ls-remote`. The token is cleared before each remote action and
redacted. The native allow-list drops `vaultRoot`/`repoPath`. Publish uses `commit --only` and restores
the index after a hook failure. Outgoing and merge-introduced blobs are scanned.

## Gates (this worktree, own Cargo target)
- `npm --prefix git-service run build`: exit 0; `npm run build`: exit 0 (`built in 1.85s`)
- `node --test` core+remote+reliability: `# tests 80`, `# pass 80`, `# fail 0`
- `cargo test`: `test result: ok. 75 passed; 0 failed`
- `git diff --check`: clean

## Unverified
- Native journey (parent-owned).
- GitHub: whether push fsck rejects `git~1` trees; `refs/heads/bitgit-checkpoints/*` may trigger
  push workflows.
- The old-build parse failure (inferred, binary not run).
- Two processes sharing one data dir (documented as uncoordinated).
- Pending IPC/UI wiring and sibling actions (not counted as defects).
