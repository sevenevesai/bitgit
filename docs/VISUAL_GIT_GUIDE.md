# Visual Git guide

How the project card, the publish dialog and the dashboard show and change Git state. The service
rules they rely on are in [GIT_OPERATIONS.md](GIT_OPERATIONS.md).

## Publishing (Push Local, Sync Branch)

Both buttons first read the folder's changed files fresh (`git_get_file_changes`).

- **Nothing uncommitted:** BitGit checks the commits that would go out and pushes them. No file
  choice is involved.
- **Uncommitted changes:** a dialog lists every changed file. **Nothing is chosen for you.** Choose
  whole files, then publish. If the list cannot be read, nothing opens and nothing is published.

In the dialog:

- Each file shows **Staged**, **Unstaged**, **Untracked** and/or **Conflicted**. A partly staged file
  shows two labels. **Preview** loads the diff for one view (`git_get_diff` with
  `scope` = `staged`, `unstaged`, `untracked` or `all`). Binary files and previews cut at the size limit say so.
- A chosen file is committed **as it is on disk**, both staged and unstaged parts. Staged files you
  do not choose stay staged and are not published. Publishing part of a file is not available.
- Conflicted files, folders/nested repositories and names starting with `-` cannot be chosen.
- The message and description are optional; an empty message becomes `Update <date time>`.
- **Choose all**, **Choose none** and **Reload** are explicit actions. Reload keeps chosen files that are
  still pending and never chooses new arrivals. Failed previews remain blocked across Reload;
  open that file's preview and retry to check its complete current diff.
- If a chosen file's preview failed, publishing stays blocked until it is retried or unchosen.

The exact list is sent to `validate_before_sync` and then to `sync_project` as `selectedFiles`.
Omitting it means "existing commits only"; the UI never sends an empty list.

### Checks before anything is sent

- If `validate_before_sync` fails, **nothing is published** and the reason is shown.
- **Blocked** items (secrets, keys, `.env`, files over 100 MB) cannot be overridden: the dialog has no publish button.
- **Warnings** need **Publish despite warnings**. That single attempt sends the same files with
  `allowWarnings: true`; later attempts ask again. **Cancel** returns to the same selection.
- **Add to .gitignore** writes the suggested patterns, then re-reads the file list. A `.gitignore`
  entry does not remove a file that is already committed or a secret already in history.
- The service checks again at publish time, so a change after the dialog still fails closed.

### Results

The outcome stays on the card until the next action (toasts disappear). It shows what the service
reported: files committed, commits pushed or pulled, or the failure message. A result with nothing
sent is shown as "nothing was sent", never as success. When files were committed but the push
failed, the message says so and the card status is re-read so the unpushed commit appears.

## Status on the card

`Refresh` (card or dashboard, Ctrl+R) re-reads Git and checks GitHub for **every project with a local
folder**, GitHub link or not. It reports actual counts: "Checked N", or how many could not be fully
checked. A failed check is never reported as refreshed.

| Shown | Meaning |
|---|---|
| Branch `main` tracks `origin/main`, N ahead, M behind | From the last check |
| GitHub last read X ago | Time of the last successful fetch |
| Synced | Only with a successful fetch in the last 30 minutes |
| Not confirmed recently | Synced when last read, but that read is older than 30 minutes |
| Status unavailable | GitHub could not be read; the error and last good check are shown, counts are marked "last known" |
| Behind GitHub / Diverged from GitHub | Sync Branch fast-forwards when behind and clean; diverged is never overwritten |
| Git unavailable | Not a Git repository. BitGit does not initialize it on read; Save & Recover still works |

Local-only Git projects can open **Details** (branches, commits, changes, stashes, tags). Changes shows
every pending file with its scope label; a failed read shows an error, not "no changes".

## Bulk actions

**Bulk Push Commits** and **Bulk Sync Branches** act on the selected projects, one row per project in
the results panel:

- Clean projects are checked and published (`selectedFiles` is never sent).
- Projects with uncommitted changes, or with warnings, are **held back** with a **Review project**
  button that opens the normal dialog. Blocked, failed and skipped projects say why.
- Nothing already up to date is counted as published.

## Branches

**Sync Branch** syncs the current branch with its own upstream only. **Pull Updates** and **Merge
Branches** open a list of other branches on GitHub (from the last check); none is chosen for you, the
confirmation names them, and exactly that list is sent as `branches`. The dialog says the branches stay
on GitHub and on this computer. Errors and conflicts are shown as the service reports them.

## Limits

- Whole files only; no line or hunk selection.
- A branch that is behind and dirty, or diverged, cannot be resolved inside BitGit yet.
- Secret screening is heuristic (see GIT_OPERATIONS.md).
- Merged branches are retained locally and remotely. The UI never offers
  deletion and shows any `deleted` list the service returns rather than hiding it.
- The freshness threshold is `STATUS_STALE_MS` in `src/components/git/gitStatusView.ts`.

## Where things live

`src/components/CommitModal.tsx`, `ValidationWarningModal.tsx`, `ProjectCard.tsx`, `Dashboard.tsx`;
`src/components/git/` (file rows, diff preview, branch dialog, status summary, bulk results);
`src/stores/useAppStore.ts` (`refreshProject`, `refreshAllProjects`, `syncProject`, `syncSelected`,
`syncingProjects`); wire types in `src/types/index.ts`.

Verified with a temporary browser fixture that runs the real components against a fake native
boundary; it is not part of the repository and is not a native run.
