# Review evidence and reproduction

The [results](history-results.json) preserve the 2026-09-30 disposable history probe at v1.1.2,
commit `de468ac67b01e13b9f940eea066e9e28123c3a36`. Temporary paths have been omitted; measurement
values and observed outcomes are unchanged. The [analysis](../ANALYSIS.md) states their limits.

## History probe

[history-probe.mjs](history-probe.mjs) is a portable adaptation of the two temporary probe scripts
used during the review. It creates its own source and vault under the system temporary directory,
retains them for inspection, and has no argument for targeting an existing project. It deliberately
adds and removes one invalid checkpoint ref in that disposable vault only.

From the repository root, build the service and run:

```powershell
npm --prefix git-service run build
node docs/design/recovery-evolution/evidence/history-probe.mjs
```

Success means exit 0 and a final JSON object naming the fixture, measured counts, corruption outcome
and healthy-recovery outcome; its `results.json` retains those observations. The script records
behaviour instead of asserting the old bug must remain. Unexpected fixture errors exit nonzero.
The run can take several minutes on the baseline because history reads are sequential. Syntax was
checked when documenting the portable adaptation; the archived measurements came from the original
review probes, not a new benchmark of this adapted script.

The first snapshot is created through the service. Additional valid parentless commits reuse its
tree and receive different IDs and manifests, isolating enumeration from source-capture costs.
The probe measures state at 1, 25 and 100 entries, introduces an invalid manifest, attempts listing,
recovers a known healthy checkpoint by ID, removes the synthetic invalid ref, and repeats state.
No user source, Git index, remote, credentials or application data directory is used.

## Native onboarding reproduction

Use the project's [isolated native smoke setup](../../../RECOVERY_DEVELOPMENT.md): a fresh absolute
`BITGIT_TEST_DATA_DIR` in a debug build disables real credential access. Build the service before
launching `npm run tauri:dev`. Choose Create your first project, enter a name, then advance to GitHub.
At the reviewed revision, the optional-credential null dereference appears as an error toast.
Skipping GitHub still allows linking a disposable local folder and saving a checkpoint.

After a fix, the success signal is a normal unconnected state with no exception, and a local save
and new-folder recovery without configuring GitHub. Do not use or clear real credentials to recreate
the first-use state. UI captures and fixtures were kept temporarily during the original review;
the permanent record here relies on the reproducible steps and code references, not those files.
