import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Clock, Crosshair, Download, History, Loader2, RefreshCw, Save, ShieldCheck, X } from 'lucide-react';
import type { Project } from '../../types';
import type { Checkpoint, RecoveryReceipt, RecoveryResults, RecoveryState } from '../../types/recovery';
import { errorMessage, markWorkspaceOpen, projectActivity, recoveryCall } from '../../lib/recovery';
import type { RecoveryAction, RequestOf } from '../../lib/recovery';
import { noteRecoveryState } from '../../lib/recovery-automation';
import { AutomationPanel } from './AutomationPanel';
import { CheckpointDetail } from './CheckpointDetail';
import { CheckpointTimeline, sortNewestFirst } from './CheckpointTimeline';
import { formatRelative, formatTimestamp, safeText, secondaryButton } from './format';
import { RecoveryGateContext } from './gate';
import type { BusyInfo, CallOptions, RecoveryGate } from './gate';
import { Notice } from './Notice';
import { PendingRepairBanner } from './PendingRepairBanner';
import { RegressionPanel } from './RegressionPanel';
import { RemoteRestore } from './RemoteRestore';
import { SaveCheckpoint } from './SaveCheckpoint';
import { TabBar, panelId, tabId } from './TabBar';
import type { TabDef } from './TabBar';

type WorkspaceTab = 'save' | 'history' | 'automation' | 'regression' | 'remote';

const STATE_LABEL = 'Checking saved history…';
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';

interface RecoveryWorkspaceProps {
  project: Pick<Project, 'id' | 'name' | 'localPath' | 'githubUrl'>;
  onClose: () => void;
}

export function RecoveryWorkspace({ project, onClose }: RecoveryWorkspaceProps) {
  const titleId = useId();
  const tabPrefix = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const pending = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const inflightReads = useRef(new Map<string, Promise<unknown>>());

  const [busy, setBusy] = useState<BusyInfo | null>(null);
  const [state, setState] = useState<RecoveryState | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>('save');
  const [visited, setVisited] = useState<ReadonlySet<WorkspaceTab>>(new Set<WorkspaceTab>(['save']));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rolledBack, setRolledBack] = useState<RecoveryReceipt | null>(null);

  const projectId = project.id;
  const projectPath = project.localPath ?? '';

  // One action at a time. Read-only requests queue behind the running one (panels load their
  // data on first open); identical reads already queued or running share a result, which also
  // absorbs the double effect run under React StrictMode. A mutation never queues: if anything
  // is pending it is refused rather than run later without the user's say-so.
  const call = useCallback(
    <A extends RecoveryAction>(label: string, request: RequestOf<A> & { action: A }, options?: CallOptions): Promise<RecoveryResults[A]> => {
      const mutating = options?.mutating ?? false;
      const key = mutating ? null : JSON.stringify(request);
      const shared = key ? inflightReads.current.get(key) : undefined;
      if (shared) return shared as Promise<RecoveryResults[A]>;
      if (mutating && pending.current > 0) {
        return Promise.reject(new Error('Another recovery action is still running. Wait for it to finish, then try again.'));
      }
      // An automatic save that started just before this window opened. It is short; refusing beats queueing
      // a change the user asked for to run later without their say-so.
      if (mutating && projectActivity(projectId).backgroundBusy) {
        return Promise.reject(new Error('An automatic save is running for this project. Wait a moment, then try again.'));
      }
      pending.current += 1;
      const start = async (): Promise<RecoveryResults[A]> => {
        setBusy({ label, mutating });
        try {
          return await recoveryCall<A>(projectId, request);
        } finally {
          pending.current -= 1;
          if (pending.current === 0) setBusy(null);
        }
      };
      const result = queue.current.then(start);
      queue.current = result.catch(() => undefined);
      if (key) {
        inflightReads.current.set(key, result);
        const clear = () => inflightReads.current.delete(key);
        result.then(clear, clear);
      }
      return result;
    },
    [projectId],
  );

  const repairPending = Boolean(state?.pendingRepair || state?.repairJournalError);
  const gate = useMemo<RecoveryGate>(() => ({ busy, call, repairPending }), [busy, call, repairPending]);

  // Every refresh is a real state call; nothing is cached between opens.
  const reload = useCallback(async () => {
    try {
      const next = await call(STATE_LABEL, { action: 'state' });
      setState(next);
      setStateError(null);
      setCheckedAt(new Date().toISOString());
      noteRecoveryState(projectId, next);
    } catch (error) {
      setStateError(errorMessage(error));
    }
  }, [call, projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // While this window is open the background observer leaves the project alone.
  useEffect(() => markWorkspaceOpen(projectId), [projectId]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      previous?.focus?.();
    };
  }, []);

  const closeLocked = busy?.mutating === true;

  // onKeyDown below only sees keys while focus is inside the dialog. A focused button that disables or
  // replaces itself (Save after saving, "Run check…" becoming its confirmation) drops focus to <body>,
  // so Escape and Tab would stop working. This catches exactly that case.
  const latest = useRef({ closeLocked, onClose });
  latest.current = { closeLocked, onClose };
  useEffect(() => {
    const rescue = (event: globalThis.KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (!dialog || dialog.contains(document.activeElement)) return;
      if (event.key === 'Escape') {
        if (!latest.current.closeLocked) latest.current.onClose();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        dialog.focus();
      }
    };
    document.addEventListener('keydown', rescue);
    return () => document.removeEventListener('keydown', rescue);
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (!closeLocked) onClose();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => element.offsetParent !== null);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const ordered = useMemo(() => sortNewestFirst(state?.checkpoints ?? []), [state]);

  // Pin the first default so a checkpoint added later (a repair's safety copy, an import)
  // does not pull the detail pane away from the one being worked on.
  useEffect(() => {
    if (selectedId === null && ordered.length > 0) setSelectedId(ordered[0].id);
  }, [selectedId, ordered]);

  const effectiveId = selectedId && ordered.some((checkpoint) => checkpoint.id === selectedId) ? selectedId : (ordered[0]?.id ?? null);
  const selected = ordered.find((checkpoint) => checkpoint.id === effectiveId) ?? null;

  const showTab = (next: WorkspaceTab) => {
    setTab(next);
    setVisited((previous) => new Set(previous).add(next));
  };

  const openCheckpoint = (id: string) => {
    setSelectedId(id);
    showTab('history');
  };

  const saved = async (checkpoint: Checkpoint) => {
    setSelectedId(checkpoint.id);
    await reload();
  };

  const imported = async (checkpoint: Checkpoint) => {
    setSelectedId(checkpoint.id);
    await reload();
  };

  const tabs: TabDef<WorkspaceTab>[] = [
    { id: 'save', label: 'Save', icon: <Save className="w-4 h-4" aria-hidden="true" /> },
    { id: 'history', label: `History${state ? ` (${state.checkpoints.length})` : ''}`, icon: <History className="w-4 h-4" aria-hidden="true" /> },
    { id: 'automation', label: 'Automatic saves', icon: <Clock className="w-4 h-4" aria-hidden="true" /> },
    { id: 'regression', label: 'Find a regression', icon: <Crosshair className="w-4 h-4" aria-hidden="true" /> },
    { id: 'remote', label: 'Restore from remote', icon: <Download className="w-4 h-4" aria-hidden="true" /> },
  ];

  const panel = (id: WorkspaceTab, content: ReactNode) =>
    visited.has(id) && (
      <div id={panelId(tabPrefix, id)} role="tabpanel" aria-labelledby={tabId(tabPrefix, id)} hidden={tab !== id} className="h-full">
        {content}
      </div>
    );

  const refreshing = busy?.label === STATE_LABEL;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50" onKeyDown={onKeyDown}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy !== null}
        tabIndex={-1}
        className="flex flex-col w-full max-w-6xl h-[90vh] overflow-hidden bg-white dark:bg-gray-800 rounded-lg shadow-xl focus:outline-none"
      >
        <div className="flex items-center justify-between gap-3 p-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex items-center gap-3 min-w-0">
            <ShieldCheck className="w-5 h-5 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden="true" />
            <div className="min-w-0">
              <h2 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-white">
                Save &amp; Recover
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                {safeText(project.name)}
                {checkedAt && (
                  <span title={formatTimestamp(checkedAt)}> · history checked {formatRelative(checkedAt) || 'just now'}</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className={secondaryButton} onClick={() => void reload()} disabled={busy !== null} title="Check saved history again">
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
              Refresh
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={closeLocked}
              aria-label="Close"
              title={closeLocked ? 'Wait for the running action to finish' : 'Close'}
              className="p-1.5 text-gray-400 rounded hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="px-4 pt-3 space-y-2">
          {busy && (
            <p role="status" className="flex items-center gap-2 text-sm text-teal-700 dark:text-teal-300">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              {busy.label}
              {busy.mutating && ' This can take a while for large projects; keep BitGit open.'}
            </p>
          )}
          {stateError && (
            <Notice
              tone="error"
              title="Could not check saved history"
              actions={
                <button type="button" className={secondaryButton} onClick={() => void reload()} disabled={busy !== null}>
                  Retry
                </button>
              }
            >
              {stateError}
            </Notice>
          )}
          {state && !state.sourceAvailable && (
            <Notice tone="warning" title="The project folder was not found">
              <span className="font-mono break-all">{safeText(projectPath)}</span>
              {'\n'}Saving, comparing and repairing are unavailable. Saved versions can still be listed and recovered into a new folder.
            </Notice>
          )}
          {!state && !stateError && (
            <p className="text-sm text-gray-500 dark:text-gray-400">The first check may take a moment while BitGit sets up saved history for this project.</p>
          )}
        </div>

        <RecoveryGateContext.Provider value={gate}>
          {(state?.pendingRepair || state?.repairJournalError || rolledBack || state?.settingsError) && (
            <div className="px-4 pt-3 space-y-2">
              {state?.repairJournalError && <Notice tone="warning" title="Saving and file repair are paused">{state.repairJournalError}{'\nOpen History to recover a saved version or safety copy into a separate folder.'}</Notice>}
              {state?.pendingRepair && (
                <PendingRepairBanner
                  pending={state.pendingRepair}
                  checkpoints={state.checkpoints}
                  onOpenCheckpoint={openCheckpoint}
                  onRolledBack={setRolledBack}
                  onChanged={reload}
                />
              )}
              {rolledBack && !state?.pendingRepair && (
                <Notice
                  tone="success"
                  title={`The interrupted repair was undone — ${rolledBack.fileCount} file${rolledBack.fileCount === 1 ? '' : 's'} put back, verified ${formatTimestamp(rolledBack.verifiedAt)}`}
                  actions={
                    <>
                      {rolledBack.safetyCheckpointId && (
                        <button type="button" className={secondaryButton} onClick={() => openCheckpoint(rolledBack.safetyCheckpointId as string)}>
                          Open safety copy
                        </button>
                      )}
                      <button type="button" className={secondaryButton} onClick={() => setRolledBack(null)}>
                        Dismiss
                      </button>
                    </>
                  }
                >
                  Saving and repairing are available again. The safety copy taken before that repair is still in History.
                </Notice>
              )}
              {state?.settingsError && (
                <Notice
                  tone="warning"
                  title="Automatic-save settings need to be saved again"
                  actions={
                    <button type="button" className={secondaryButton} onClick={() => showTab('automation')}>
                      Open Automatic saves
                    </button>
                  }
                >
                  {state.settingsError}
                  {'\nYour saved versions are all still listed. Automatic saves stay off for this project until you save the settings again.'}
                </Notice>
              )}
            </div>
          )}
          <div className="px-4 pt-3">
            <TabBar prefix={tabPrefix} label="Recovery sections" tabs={tabs} active={tab} onChange={showTab} />
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            {panel(
              'save',
              <SaveCheckpoint state={state} projectPath={projectPath} onSaved={saved} onOpenCheckpoint={openCheckpoint} />,
            )}
            {panel(
              'history',
              <div className="grid gap-4 md:grid-cols-[19rem_minmax(0,1fr)]">
                <div>
                  <CheckpointTimeline checkpoints={ordered} selectedId={effectiveId} onSelect={setSelectedId} />
                </div>
                <div className="min-w-0">
                  {state && selected ? (
                    <CheckpointDetail
                      key={selected.id}
                      checkpoint={selected}
                      state={state}
                      projectName={project.name}
                      projectPath={projectPath}
                      githubUrl={project.githubUrl}
                      onOpenCheckpoint={openCheckpoint}
                      onChanged={reload}
                    />
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Select a saved version to see its details.</p>
                  )}
                </div>
              </div>,
            )}
            {panel('automation', <AutomationPanel projectId={projectId} state={state} onChanged={reload} />)}
            {panel(
              'regression',
              <RegressionPanel
                projectId={projectId}
                projectName={project.name}
                projectPath={projectPath}
                state={state}
                onOpenCheckpoint={openCheckpoint}
                onChanged={reload}
              />,
            )}
            {panel(
              'remote',
              <RemoteRestore
                projectName={project.name}
                projectPath={projectPath}
                defaultRemoteUrl={project.githubUrl}
                state={state}
                onImported={imported}
                onRecovered={reload}
              />,
            )}
          </div>
        </RecoveryGateContext.Provider>

        <div className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 border-t dark:border-gray-700">
          Saved versions are copies of your files kept
          {state ? (
            <>
              {' '}
              at <span className="font-mono break-all">{safeText(state.vaultPath)}</span>
            </>
          ) : (
            ' on this computer'
          )}
          . BitGit keeps every saved version and never deletes one automatically. A saved version is not tested: it is only a copy of the files listed as
          included.
        </div>
      </div>
    </div>
  );
}
