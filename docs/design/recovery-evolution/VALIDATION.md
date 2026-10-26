# Recovery evolution validation and research

Status: proposed acceptance framework. Select checks that cover the implemented slices; this document
does not require building the full catalogue or running every test for a narrow change. Current
build/test commands and native isolation instructions live in
[development](../../RECOVERY_DEVELOPMENT.md) and the root [project instructions](../../../CLAUDE.md).

## Evidence classes

Keep source-inspected behaviour, reproduced runtime results, proposed targets and participant
observations distinct. The [review analysis](ANALYSIS.md) is a dated snapshot. Recheck its code and
reproduce relevant findings before implementing a fix; do not report old successful tests as current.

Use disposable repositories, local bare remotes and an isolated native data directory. Real source
HEAD, index, remotes and user history are not test fixtures. GitHub transport, installation and each
additional operating system need their own evidence beyond local fixtures.

## Engineering acceptance map

| Feature | Outcome to prove | Failure or boundary to exercise |
|---|---|---|
| H history | Bounded summary/page reads and accessible healthy entries | Bad manifest/object/receipt/index; concurrent page updates; source absent |
| O onboarding | First save and verified copy without GitHub knowledge | No credentials, missing runtime, cancelled picker, changing source, offline setup |
| D overview | Correct scoped facts and useful next actions | Unknown freshness, partial coverage, newer save than remote copy, old evidence |
| A capture | Actual saves through selected background lifecycle | Close/quit/sleep, continuous edits, lost events, contention, low disk, interrupted prune |
| G guidance | User reaches the intended recovery and validates explicitly | Wrong version, missing setup, changed recipe, flaky check, newer edit before return |
| B portability | Selected code and context recover from an independent package | Malicious/truncated package, conflicting identity, missing original, later metadata |
| E behaviour | Correct lookup of recorded behaviour evidence | Conflicting observations, changed environment, renamed behaviour, unobserved version |
| I integration | Caller and UI agree on receipt and exact version | Response loss, duplicate request, missing host, wrong project, stale navigation |
| P power use | Each selected feature shortens its intended task | Keyboard scope, unloaded search results, inherited policy change, mixed bulk outcomes |
| X experiments | Preserve useful changes while applying a reviewed repair | Shared-file edits, no valid baseline, conflicts, stale source, interrupted application |

Each feature spec supplies detailed criteria. Reuse existing outcome-based tests when possible.
Avoid tests that merely mirror a UI implementation. Build/check exit 0 is necessary for relevant
code changes but cannot prove a native picker, credentials, background lifetime or filesystem effects.

## Performance measurement

Record runtime versions, operating system, hardware, source size, eligible file count, checkpoint
count, evidence size, cache state and concurrent workload. Compare cold index construction, warm
summary, first page, selected detail and source capture separately. Report repeated distributions
for performance acceptance rather than promoting a single local measurement to a percentile.

Use 1, 25 and 100 entries to reproduce the review; use 1,000 and 10,000 for history scaling. Include
larger manifests and screenshots without eagerly loading them. Measure many-project scheduling,
UI responsiveness and idle disk activity independently. Proposed H targets are goals to establish
on a named reference machine, not promises that the reviewed app already meets them.

## Native journeys

1. New user with a plain local folder and no GitHub credentials: save, recover, open the copy and
   correctly describe what was excluded.
2. Developer with partial staging and untracked source: save, compare, inspect Git details and
   recover without disturbing source HEAD/index or publishing unselected work.
3. User with many checkpoints and one damaged record: find and recover a healthy version while
   the problem remains visible.
4. User with background mode selected: close, edit, sleep/wake and reopen; inspect actual receipts
   and distinguish quit time from observed time.
5. User restoring on a fresh profile: import selected code and context, inspect missing external
   requirements, and run a chosen check only after explicit invocation.
6. User preserving a useful change while repairing another in the same file: construct a candidate,
   inspect evidence, apply reviewed whole-file results and retain a path back to the current attempt.

Drive the real native app for selected affected journeys, including keyboard/focus behaviour and
actual dialogs. Browser mocks can isolate UI logic but do not substitute for native verification.

## Audience research

Recruit a small exploratory group, initially about six to eight participants across both main
cohorts, including people who already use an editor or agent's rewind. This is usability/need research,
not a representative estimate of market size. Recruitment itself is not authorized by this spec.

Ask participants to explain their last regression and current recovery process before demonstrating
BitGit. Use a disposable project with a recognisable working behaviour, a useful later improvement,
a regression, an untracked source file and clearly synthetic excluded material.

| Task | Observation to collect |
|---|---|
| Protect before a coding session | Can they identify saved scope and distinguish local from remote? |
| Find the desired version | Which labels/evidence do they use; do they choose correctly? |
| Recover while retaining current work | Completion, lost work, assistance and time to resume useful work |
| Interpret a stale or failed backup check | Do they recognise uncertainty instead of assuming remote survival? |
| Use behaviour history | Is selecting by observed behaviour faster and correctly qualified? |
| Repair a mixed change | Are useful improvements preserved; do conflicts and tests make sense? |
| Try an integration | Does it remove an app switch or duplicate existing harness behaviour? |

Use voluntary follow-up to observe checkpoint reuse, a recovery rehearsal, abandonment reasons and
configuration burden. Do not collect source code, transcripts or telemetry by default. Participant
observations can be recorded manually with their consent and appropriate data handling.

## Adoption decisions

Prioritise observed lost-work risk and failed recovery before convenience. Keep behaviour history if
users repeatedly use its evidence to choose versions correctly; simplify or defer it if annotation
effort outweighs benefit. Expand adapters only when a real host workflow needs them. Advance semantic
repair assistance only after deterministic experiments reliably preserve intended changes.

For each selected release, record what was implemented, tested, untested and still hypothetical.
Do not convert proposed acceptance targets or this research plan into claimed results.
