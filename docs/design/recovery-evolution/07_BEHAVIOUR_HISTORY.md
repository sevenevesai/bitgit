# Behaviour history

Status: proposed priority 7 and product experiment. The hypothesis is that people can choose a
recovery point more reliably by a remembered behaviour, such as login or export, than by dates and
filenames. Existing notes and checks supply the foundation; adoption has not been validated.

## E1 Named behaviours

Let users define a small set of project behaviours with a stable ID, editable name and optional
description. Examples are Password login, Checkout with a test card and PDF export. Do not force a
complete feature map or infer one from the source tree before the feature becomes useful.

A behaviour may reference manual steps or a versioned check recipe. It is distinct from a project
label, checkpoint tag and Git branch. Renaming a behaviour preserves its ID and historical observations.
Archived behaviours remain visible in old evidence and can be reactivated.

## E2 Exact version observations

An observation binds behaviour ID, checkpoint ID, result, observation time, method and evidence.
Methods include a manual report and an explicitly run recipe. Record relevant setup/environment
qualifications without retaining credentials or the complete process environment.

Use Worked when observed, Failed when observed, Inconclusive and Not observed. Multiple observations
may disagree; show the disagreement and its context rather than selecting a convenient green result.
A successful build applies to its declared check scope, not automatically to every project behaviour.

Evidence is append-only. A corrected manual observation can supersede a prior interpretation while
retaining its original record. An immutable command result stays a recorded execution fact even when
a user later explains that it was the wrong test. Recipe edits create new recipe versions.

No result silently propagates to a different checkpoint. Matching files or a recent timestamp may
support a suggestion to check again, but do not prove that behaviour at a new version or environment.

## E3 Last observed working lookup

Provide a behaviour filter on checkpoint history and an optional matrix of behaviours against saved
versions. Each cell links to the actual observations and their scope. A useful query is Latest saved
version where password login was observed working under a chosen recipe/environment.

Return the checkpoint, observation date, source of evidence, qualification and any later contradictory
result. If several versions satisfy different conditions, show the alternatives rather than treating
them as equally certified. No observation produces No recorded result, not Failed.

Users can open, compare or recover the selected version through the ordinary journey. Allow an
observation to prefill a proposed regression endpoint, but require the user to confirm that it tests
the same symptom and conditions. Temporal order alone does not identify a cause.

## E4 Optional assisted suggestions

After the deterministic pilot is useful, evaluate suggestions for behaviour names, evidence links
or readable summaries. Start from user-selected notes and diffs. Show the evidence supporting each
suggestion and let the user accept or correct it.

Assistance must not manufacture an observation or label a version working. The basic feature works
without a model. Any external model integration separately defines the chosen provider, content to
send, authentication, cost limits and user control; no private transcripts are imported by default.

## Proposed data relationships

| Entity | Required relationship |
|---|---|
| Behaviour | Owned by a project identity, independent of a folder path or label |
| Observation | One behaviour and one checkpoint, with method, result and qualifications |
| Recipe reference | Exact immutable recipe version used for a command observation |
| Evidence reference | Existing note, screenshot or command record; preserve provenance |
| Superseding interpretation | References the original observation without deleting it |

Portable packages can include these entities only after their schema is versioned and selected for
export. Local interpretation and remote historical facts remain distinguishable after import.

## Acceptance criteria

- Create two behaviours and observations across several checkpoints, then find the correct last
  observed working version without reading code or relying on a commit hash.
- Rename or archive a behaviour and edit its recipe. Earlier evidence remains correctly attributed.
- Conflicting results and different environments remain visible; a newer save starts unobserved.
- Correct a mistaken manual observation without erasing the earlier record.
- A missing screenshot or damaged evidence item does not hide the underlying healthy checkpoint.
- Regression endpoint suggestions state their source and do not claim the failure is monotonic.
- Optional assistance produces editable suggestions, never synthetic passes or silent network work.

## Pilot and open decisions

Pilot E1-E3 with a small number of behaviours users already care about. Measure whether participants
choose the right version faster and correctly explain the evidence's limits. Watch whether recording
observations creates more work than it saves. Stop or simplify if participants do not reuse it.

Choose vocabulary, conflict presentation, observation correction rules and environment filters from
the pilot. E4 is separately selectable and has no priority over reliable manual evidence.

## Implementation map

`git-service/src/recovery-types.ts`, `recovery-metadata.ts`, `recovery-evidence.ts`,
`recovery-regression.ts`; `src/components/recovery/EvidencePanel.tsx`, `CheckpointTimeline.tsx`,
`RegressionPanel.tsx`. Reuse H2's index for lookup and G5's recipe identity.
