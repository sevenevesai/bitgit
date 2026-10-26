# Experiments and selective repair

Status: proposed priority 10 and research hypothesis. Help a user keep useful improvements while
repairing a regression, including when both changes occupy the same file. Begin with deterministic
comparison and explicit selection before considering syntax-aware or AI assistance.

## Current boundary

Existing repair restores explicitly selected whole files from a checkpoint, preserving a safety
snapshot and the real Git index. This is useful but cannot retain a new theme and remove a login
regression in the same file unless the user first constructs the desired combined content.
Current regression search identifies an observed version boundary, not a faulty feature or patch.

## X1 Separate experiment

Create a managed experiment from immutable selected inputs in a new folder. Record its project
identity, source checkpoint, current-work checkpoint, selected comparison baseline, purpose and
location. Preserve the current attempt before the experiment; no successful creation changes the
working project or its Git staging.

Default to an ordinary recovered folder. An optional Git worktree implementation must be explicitly
selected and document its writes to source Git metadata, branch lifecycle and cleanup. It is not a
transparent substitute for the existing no-source-mutation copy path, and plain folders remain supported.

List experiments with origin, last known contents, check state and location availability. Opening,
abandoning and deleting an experiment are distinct actions. Cleanup targets only a verified owned
directory; the user can retain or export useful candidate work before explicit removal.

## X2 Three way comparison

Show a baseline B, the preserved current attempt C, and a desired historical version or repair input G.
Resolve each to immutable content. Explain what each side means and allow the user to correct the
selection. Checkpoint commits are independent snapshots, so Git ancestry cannot be assumed.

Where a meaningful common baseline exists, compare B to C and B to G to expose overlapping and
independent changes. When the baseline relationship is unknown, provide explicit pairwise comparison
and manual selection rather than inventing an automatic merge base.

Surface additions, deletions, renames where evidenced, conflicts, binary content, and omitted scope.
A clean textual merge is only a syntactic result; dependencies and external state can still make
the candidate wrong. Preserve all input versions and the operation's provenance.

## X3 Selected hunks and files

Start a candidate from C and apply explicitly selected changes in the experiment. Support choosing
whole files, then bounded text hunks where enough context exists. Show orientation clearly: keep
current change, replace with historical content, or edit candidate manually.

Hunk application checks the pinned input and surrounding context. Changed, ambiguous, binary or
truncated content must not receive an inferred patch. Conflicts remain unresolved until reviewed.
Recompute the candidate comparison after edits and retain which changes were selected versus edited.

The resulting candidate contains complete files even when selection was at hunk level. This does not
add partial-file publishing or overwrite the source index. Existing whole-file publish semantics
continue to apply if the user later chooses to publish the candidate's results.

## X4 Candidate checks

Promote the candidate's exact contents to a new immutable checkpoint or equivalent validated input
before recording check evidence. It carries derived-from relationships to the original versions;
the originals are not amended. Reuse explicitly invoked [check recipes](05_GUIDED_RECOVERY.md#g5-reusable-check-recipes)
and manual observations against that candidate.

If a check or editor changes eligible candidate source, the previous result does not cover the new
contents. Capture a new candidate revision and rerun selected checks when requested. Show passed,
failed, untested and inconclusive results by scope. The user can compare candidates side by side
without a global claim that one application version is correct.

## X5 Reviewed application and recovery

The user may keep the candidate as a separate project, export it, or apply selected resulting files
to the original working project. Before application, compare against fresh source contents and show
the exact complete-file effects, affected paths and any work added since the experiment began.

Apply through a validated extension of the existing repair protocol: fresh fingerprint, complete
safety checkpoint, protected handling of touched excluded files, journal before writes, byte
verification and explicit interrupted-operation recovery. Preserve unrelated source files, HEAD,
index, branches and remotes. Current edits that invalidate the plan require review again.

Return the safety checkpoint and operation receipt. A completed application can offer the reviewed
[return flow](05_GUIDED_RECOVERY.md#g6-return-to-work-from-before-a-repair); a crash follows the
interrupted-repair journal. Copying candidate files over the project outside this protocol is not
an acceptable implementation shortcut.

## X6 Optional syntax and AI assistance

Evaluate syntax-aware merge suggestions or AI-proposed patches only after X1-X5 are reliable and
participants repeatedly need mixed-change repair. Suggestions operate on selected immutable inputs
and produce a candidate diff, rationale, evidence references and unresolved assumptions.

No assistant silently applies changes to current work, publishes a branch, invents passed checks,
or identifies a proven cause from the regression boundary. The user reviews each proposed effect.
External model use needs an explicit provider/content/cost decision and may be omitted entirely.
The deterministic experiment workflow must remain useful without it.

## Candidate lifecycle

Use explicit states: Preparing, Editable candidate, Unresolved conflicts, Captured candidate,
Checks recorded, Ready for review, Applying, Applied, Interrupted, and Retained or discarded.
Check results attach to a captured revision, not a mutable folder. State transitions are durable
enough to distinguish an interrupted preparation from an interrupted source application.

A missing experiment folder is a location failure, not permission to delete its source checkpoints.
Retain referenced inputs and safety checkpoints until experiment ownership is resolved. Reopening
an experiment never resumes an application or runs commands automatically.

## Acceptance criteria

- Use a fixture with a broken login and useful new styling in the same file. Construct a candidate
  restoring login while retaining the styling, with all originals recoverable.
- Exercise overlapping hunks, binary files, missing files, unsupported paths and absent common
  baselines. Ambiguity produces explicit review, not an inferred patch.
- Edit the source after candidate review. Application rejects the stale plan without overwriting it.
- Verify source HEAD and staged entries survive candidate creation, comparison and application.
- Inject interruption during candidate creation and each repair write boundary. Recover healthy
  content and expose the correct journal/safety checkpoint without silent rollback.
- Modify candidate source after a passed check. The UI no longer presents that result as covering
  the new candidate revision.
- Delete or move the experiment folder. Historical receipts and original snapshots remain available.
- Optional assistance cannot bypass selection, checks, request permissions or repair validation.

## Selection and open decisions

Pilot X1-X3 with manual validation before broad semantic-repair investment. X4-X5 are required before
offering source application as a dependable workflow. X6 is an independent research choice.
Decide candidate storage identity, checkpoint lineage format, supported merge baselines, hunk limits,
conflict UI and experiment cleanup ownership before implementation. Measure whether users preserve
desired improvements more reliably than with the current copy-and-compare workflow.

## Implementation map

`git-service/src/recovery-repair.ts`, `recovery-service.ts`, `recovery-evidence.ts`,
`recovery-types.ts`; `src/components/recovery/CompareView.tsx`, `RepairPanel.tsx`,
`RecoverCopy.tsx`, plus a new experiment view and bounded comparison service.
