import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Check, Flag, Loader2, Play, SkipForward, X } from 'lucide-react';
import type { Checkpoint, RecoveryState, RegressionSession } from '../../types/recovery';
import { errorMessage } from '../../lib/recovery';
import { CheckPanel } from './CheckPanel';
import { CopyButton } from './CopyButton';
import { formatTimestamp, inputClass, kindLabel, primaryButton, safeText, secondaryButton, shortId } from './format';
import { useRecoveryGate } from './gate';
import { Notice } from './Notice';
import { PagedList } from './PagedList';
import { RecoverCopy } from './RecoverCopy';

type Outcome = 'good' | 'bad' | 'skip';

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const pointerKey = (projectId: string) => `bitgit.recovery.regression.${projectId}`;

// Only a pointer to the last session lives here; the vault holds the observations and is the authority.
function readPointer(projectId: string): string | null {
  try {
    return window.localStorage.getItem(pointerKey(projectId));
  } catch {
    return null; // Storage can be unavailable; the session ID can still be pasted to resume.
  }
}

function writePointer(projectId: string, sessionId: string | null) {
  try {
    if (sessionId) window.localStorage.setItem(pointerKey(projectId), sessionId);
    else window.localStorage.removeItem(pointerKey(projectId));
  } catch {
    // Losing the pointer only means the ID must be pasted next time.
  }
}

// Same order the engine uses to build a session, so "earlier" and "later" mean what it means.
const chronological = (a: Checkpoint, b: Checkpoint) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

const OUTCOME_LABEL: Record<Outcome, string> = { good: 'Good', bad: 'Bad', skip: 'Skipped' };
const OUTCOME_CLASS: Record<Outcome, string> = {
  good: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  bad: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  skip: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
};

interface RegressionPanelProps {
  projectId: string;
  projectName: string;
  projectPath: string;
  state: RecoveryState | null;
  onOpenCheckpoint: (id: string) => void;
  onChanged: () => Promise<void>;
}

export function RegressionPanel({ projectId, projectName, projectPath, state, onOpenCheckpoint, onChanged }: RegressionPanelProps) {
  const { call, busy } = useRecoveryGate();
  const goodSelect = useId();
  const badSelect = useId();
  const pasteInput = useId();
  const [session, setSession] = useState<RegressionSession | null>(null);
  const [pointer, setPointer] = useState<string | null>(() => readPointer(projectId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [goodId, setGoodId] = useState('');
  const [badId, setBadId] = useState('');
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [pasted, setPasted] = useState('');
  const [pending, setPending] = useState<Outcome | null>(null);
  const [observing, setObserving] = useState(false);
  const [observeError, setObserveError] = useState<string | null>(null);

  const ordered = useMemo(() => [...(state?.checkpoints ?? [])].sort(chronological), [state]);
  const byId = useMemo(() => new Map(ordered.map((checkpoint) => [checkpoint.id, checkpoint])), [ordered]);

  const remember = useCallback(
    (id: string | null) => {
      setPointer(id);
      writePointer(projectId, id);
    },
    [projectId],
  );

  const load = useCallback(
    async (id: string) => {
      setLoadError(null);
      try {
        const loaded = await call('Loading the regression session…', { action: 'regressionGet', sessionId: id });
        setSession(loaded);
        setPending(null);
        setObserveError(null);
        remember(id);
      } catch (error) {
        setSession(null);
        setLoadError(errorMessage(error));
      }
    },
    [call, remember],
  );

  // Reopening the workspace picks up where the last session stopped. Runs once: later pointer
  // changes come from actions that load or create the session themselves.
  useEffect(() => {
    if (pointer) void load(pointer);
  }, []);

  if (!state) return <p className="text-sm text-gray-500 dark:text-gray-400">Saved history has not loaded yet. Use Retry above.</p>;

  const describe = (id: string) => {
    const checkpoint = byId.get(id);
    return checkpoint ? `“${safeText(checkpoint.label) || '(unnamed)'}” (${formatTimestamp(checkpoint.createdAt)})` : `saved version ${shortId(id)} (not in this history)`;
  };

  const goodIndex = ordered.findIndex((checkpoint) => checkpoint.id === goodId);
  const badIndex = ordered.findIndex((checkpoint) => checkpoint.id === badId);
  const rangeProblem =
    goodId && badId && goodId === badId
      ? 'Choose two different saved versions.'
      : goodIndex >= 0 && badIndex >= 0 && goodIndex > badIndex
        ? 'The known-good version must have been saved before the known-bad one.'
        : null;
  const canStart = busy === null && goodIndex >= 0 && badIndex >= 0 && rangeProblem === null;

  const start = async () => {
    setStartError(null);
    setStarting(true);
    try {
      const created = await call('Starting the regression search…', { action: 'regressionStart', goodId, badId }, { mutating: true });
      setSession(created);
      setLoadError(null);
      setPending(null);
      setObserveError(null);
      remember(created.id);
    } catch (error) {
      setStartError(errorMessage(error));
    } finally {
      setStarting(false);
    }
  };

  const resume = async () => {
    const id = pasted.trim().toLowerCase();
    if (!SESSION_ID.test(id)) {
      setLoadError('That is not a session ID. It looks like 8-4-4-4-12 letters and digits, for example 123e4567-e89b-42d3-a456-426614174000.');
      return;
    }
    await load(id);
    setPasted('');
  };

  const observe = async (outcome: Outcome) => {
    if (!session?.nextId) return;
    setObserveError(null);
    setObserving(true);
    try {
      const updated = await call(
        'Recording your result…',
        { action: 'regressionObserve', sessionId: session.id, checkpointId: session.nextId, outcome },
        { mutating: true },
      );
      setSession(updated);
      setPending(null);
    } catch (error) {
      setObserveError(errorMessage(error));
    } finally {
      setObserving(false);
    }
  };

  const startNew = () => {
    setSession(null);
    setLoadError(null);
    setPending(null);
    setObserveError(null);
    remember(null);
  };

  const positions = session ? new Map(session.candidateIds.map((id, index) => [id, index])) : null;
  const observed = session ? Object.entries(session.observations) : [];
  const lastGood = session && positions ? Math.max(...observed.filter(([, o]) => o === 'good').map(([id]) => positions.get(id) ?? -1)) : -1;
  const firstBad = session && positions ? Math.min(...observed.filter(([, o]) => o === 'bad').map(([id]) => positions.get(id) ?? Infinity)) : Infinity;
  const lastGoodId = session && lastGood >= 0 ? session.candidateIds[lastGood] : null;
  const firstBadObserved = session && Number.isFinite(firstBad) ? session.candidateIds[firstBad] : null;
  const untriedBetween = session ? session.candidateIds.filter((id, index) => index > lastGood && index < firstBad && !session.observations[id]).length : 0;
  const next = session?.nextId ? (byId.get(session.nextId) ?? null) : null;

  const resumeForm = (
    <div className="space-y-1">
      <label htmlFor={pasteInput} className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Resume a session by its ID
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id={pasteInput}
          type="text"
          value={pasted}
          onChange={(event) => setPasted(event.target.value)}
          placeholder="Paste a session ID"
          className={`${inputClass} font-mono flex-1 min-w-[16rem]`}
          spellCheck={false}
        />
        <button type="button" className={secondaryButton} onClick={() => void resume()} disabled={busy !== null || pasted.trim() === ''}>
          Resume
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="space-y-2">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Find roughly when a problem first showed up. Pick a saved version where the problem was <strong>not</strong> there (known good) and a later one where it
          <strong> is</strong> (known bad). BitGit then suggests one version in between at a time. You try it and answer Good, Bad or Skip, and the range narrows.
        </p>
        <Notice tone="info" title="What this can and cannot tell you">
          It assumes one problem that, once it appears, stays in every later version. If the problem comes and goes, or depends on something outside your files,
          the answer can be wrong. The result is a range of saved versions, not a proven cause: BitGit does not name a file, feature or change, and it never changes
          your project.
        </Notice>
      </div>

      {loadError && (
        <Notice
          tone="error"
          title="That regression session could not be opened"
          actions={
            <>
              {pointer && (
                <button type="button" className={secondaryButton} onClick={() => startNew()}>
                  Forget this session
                </button>
              )}
              {pointer && (
                <button type="button" className={secondaryButton} onClick={() => void load(pointer)} disabled={busy !== null}>
                  Try again
                </button>
              )}
            </>
          }
        >
          {loadError}
          {'\nThe saved versions themselves are not affected. Start a new session from the same two versions, or resume a different session ID.'}
        </Notice>
      )}

      {!session && (
        <>
          <section aria-labelledby={`${goodSelect}-title`} className="space-y-3">
            <h3 id={`${goodSelect}-title`} className="text-sm font-semibold text-gray-900 dark:text-white">
              Start a new search
            </h3>
            {ordered.length < 2 ? (
              <Notice tone="info">You need at least two saved versions, one from before the problem and one from after it. Save or import more versions first.</Notice>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor={goodSelect} className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Earlier version: known good
                    </label>
                    <select id={goodSelect} value={goodId} onChange={(event) => setGoodId(event.target.value)} className={inputClass} disabled={starting}>
                      <option value="">Choose a version…</option>
                      {ordered.map((checkpoint) => (
                        <option key={checkpoint.id} value={checkpoint.id}>
                          {`${safeText(checkpoint.label) || '(unnamed)'} · ${formatTimestamp(checkpoint.createdAt)} · ${kindLabel(checkpoint.kind)}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={badSelect} className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Later version: known bad
                    </label>
                    <select id={badSelect} value={badId} onChange={(event) => setBadId(event.target.value)} className={inputClass} disabled={starting}>
                      <option value="">Choose a version…</option>
                      {ordered.map((checkpoint) => (
                        <option key={checkpoint.id} value={checkpoint.id}>
                          {`${safeText(checkpoint.label) || '(unnamed)'} · ${formatTimestamp(checkpoint.createdAt)} · ${kindLabel(checkpoint.kind)}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Versions are listed oldest first. Every saved version between the two is part of the search, including automatic saves and safety copies.</p>
                {rangeProblem && <p className="text-xs text-red-600 dark:text-red-400">{rangeProblem}</p>}
                {startError && (
                  <Notice tone="error" title="The search was not started">
                    {startError}
                  </Notice>
                )}
                <button type="button" className={primaryButton} onClick={() => void start()} disabled={!canStart}>
                  {starting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Play className="w-4 h-4" aria-hidden="true" />}
                  Start search
                </button>
              </>
            )}
          </section>
          {resumeForm}
        </>
      )}

      {session && positions && (
        <>
          <section aria-label="Regression search summary" className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
              <span>
                Session ID <span className="font-mono break-all">{session.id}</span>
              </span>
              <CopyButton text={session.id} label="Copy session ID" />
              <button type="button" className={secondaryButton} onClick={() => startNew()} disabled={busy !== null}>
                Start a new session
              </button>
            </div>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Latest version known good</dt>
                <dd className="text-gray-900 dark:text-gray-100 break-words">{lastGoodId ? describe(lastGoodId) : 'None yet'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Earliest version seen bad</dt>
                <dd className="text-gray-900 dark:text-gray-100 break-words">{firstBadObserved ? describe(firstBadObserved) : 'None yet'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Search range</dt>
                <dd className="text-gray-900 dark:text-gray-100">
                  {session.candidateIds.length} saved versions, {observed.length} answered, {untriedBetween} still to try between good and bad
                </dd>
              </div>
            </dl>
          </section>

          {session.complete ? (
            <div className="space-y-2">
              <Notice tone="success" title="The search is finished">
                The earliest saved version where you saw the problem is {session.firstBadId ? describe(session.firstBadId) : 'unknown'}. The latest version you marked
                good before it is {lastGoodId ? describe(lastGoodId) : 'unknown'}.
                {'\nThe problem showed up somewhere in that step. This does not prove which file or change caused it.'}
              </Notice>
              {session.inconclusiveIds.length > 0 && (
                <Notice tone="warning" title={`${session.inconclusiveIds.length} skipped version${session.inconclusiveIds.length === 1 ? '' : 's'} make the boundary uncertain`}>
                  You skipped {session.inconclusiveIds.length === 1 ? 'a version' : 'versions'} between the last good and the first bad one, so the problem may have
                  started at any of them:
                  <ul className="mt-1 list-disc pl-5">
                    {session.inconclusiveIds.map((id) => (
                      <li key={id}>{describe(id)}</li>
                    ))}
                  </ul>
                </Notice>
              )}
              <div className="flex flex-wrap gap-2">
                {session.firstBadId && (
                  <button type="button" className={secondaryButton} onClick={() => onOpenCheckpoint(session.firstBadId as string)}>
                    View the first bad version in History
                  </button>
                )}
                {lastGoodId && (
                  <button type="button" className={secondaryButton} onClick={() => onOpenCheckpoint(lastGoodId)}>
                    View the last good version in History
                  </button>
                )}
              </div>
            </div>
          ) : (
            session.nextId && (
              <section aria-label="Version to try next" className="p-4 space-y-4 border border-teal-300 dark:border-teal-800 rounded-lg bg-teal-50/40 dark:bg-teal-900/10">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Try this version next</h3>
                  <p className="text-base font-medium text-gray-900 dark:text-white break-words">{next ? safeText(next.label) || '(unnamed)' : `Saved version ${shortId(session.nextId)}`}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {next ? `${formatTimestamp(next.createdAt)} · ${kindLabel(next.kind)} · ` : ''}
                    <span className="font-mono">{shortId(session.nextId)}</span>
                  </p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Recover it into a new folder and try it there, or run a check on it. Your project is not changed. Then say what you found.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={secondaryButton} onClick={() => onOpenCheckpoint(session.nextId as string)}>
                    View or compare in History
                  </button>
                </div>
                <details className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
                  <summary className="px-3 py-2 text-sm font-medium cursor-pointer text-gray-800 dark:text-gray-200">Recover this version into a new folder</summary>
                  <div className="px-3 pb-3">
                    <RecoverCopy key={session.nextId} checkpointId={session.nextId} projectName={projectName} projectPath={projectPath} vaultPath={state.vaultPath} onRecovered={onChanged} />
                  </div>
                </details>
                <details className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
                  <summary className="px-3 py-2 text-sm font-medium cursor-pointer text-gray-800 dark:text-gray-200">Run a command check on this version</summary>
                  <div className="px-3 pb-3 space-y-2">
                    <CheckPanel key={session.nextId} checkpoint={{ id: session.nextId, label: next?.label ?? shortId(session.nextId), metadataError: next?.metadataError }} onRecorded={onChanged} />
                    <p className="text-xs text-gray-500 dark:text-gray-400">A check result is never recorded as Good or Bad for you. Decide below.</p>
                  </div>
                </details>

                <div role="group" aria-label="Your result for this version" className="space-y-2">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Is the problem present in this version?</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={secondaryButton} onClick={() => setPending('good')} disabled={busy !== null} aria-pressed={pending === 'good'}>
                      <Check className="w-4 h-4" aria-hidden="true" />
                      Good: no problem here
                    </button>
                    <button type="button" className={secondaryButton} onClick={() => setPending('bad')} disabled={busy !== null} aria-pressed={pending === 'bad'}>
                      <X className="w-4 h-4" aria-hidden="true" />
                      Bad: the problem is here
                    </button>
                    <button type="button" className={secondaryButton} onClick={() => setPending('skip')} disabled={busy !== null} aria-pressed={pending === 'skip'}>
                      <SkipForward className="w-4 h-4" aria-hidden="true" />
                      Skip: cannot tell
                    </button>
                  </div>
                  {pending && (
                    <div role="group" aria-label="Confirm your result" className="space-y-2">
                      <Notice tone="warning" title={`Record “${OUTCOME_LABEL[pending]}” for ${next ? `“${safeText(next.label) || '(unnamed)'}”` : `version ${shortId(session.nextId)}`}?`}>
                        An answer cannot be changed in this session. To retest a version, start a new session. Use Skip if the result is unreliable (a flaky test, a
                        timeout, or you could not run it).
                      </Notice>
                      <div className="flex gap-2">
                        <button type="button" className={primaryButton} onClick={() => void observe(pending)} disabled={busy !== null}>
                          {observing ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Flag className="w-4 h-4" aria-hidden="true" />}
                          Record {OUTCOME_LABEL[pending]}
                        </button>
                        <button type="button" className={secondaryButton} onClick={() => setPending(null)} disabled={busy !== null}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  {observeError && (
                    <Notice tone="error" title="Your answer was not recorded">
                      {observeError}
                    </Notice>
                  )}
                </div>
              </section>
            )
          )}

          <section aria-label="All versions in this search" className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Versions in this search (oldest first)</h3>
            <PagedList
              items={session.candidateIds}
              step={50}
              itemKey={(id) => id}
              className="divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg"
              renderItem={(id) => {
                const outcome = session.observations[id];
                const isNext = id === session.nextId && !session.complete;
                return (
                  <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                    <span className="min-w-0 flex-1 text-gray-900 dark:text-gray-100 break-words">{describe(id)}</span>
                    {isNext && <span className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300">try next</span>}
                    {outcome ? (
                      <span className={`px-2 py-0.5 rounded-full ${OUTCOME_CLASS[outcome]}`}>{OUTCOME_LABEL[outcome]}</span>
                    ) : (
                      <span className="text-gray-500 dark:text-gray-400">not tried</span>
                    )}
                    {id === session.goodId && <span className="text-gray-500 dark:text-gray-400">your good starting point</span>}
                    {id === session.badId && <span className="text-gray-500 dark:text-gray-400">your bad starting point</span>}
                  </div>
                );
              }}
            />
          </section>

          <details className="border border-gray-200 dark:border-gray-700 rounded-lg">
            <summary className="px-3 py-2 text-sm font-medium cursor-pointer text-gray-800 dark:text-gray-200">Resume a different session</summary>
            <div className="px-3 pb-3">{resumeForm}</div>
          </details>
        </>
      )}
    </div>
  );
}
