import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Clock, Loader2, RefreshCw, Save, X } from 'lucide-react';
import type { CheckpointPreview, RecoveryState } from '../../types/recovery';
import { errorMessage } from '../../lib/recovery';
import { describeTickReason, noteRecoverySettings, noteRecoveryTick, TICK_INTERVAL_MS, useAutomationStatus } from '../../lib/recovery-automation';
import { CoverageView } from './CoverageView';
import { formatBytes, formatRelative, formatTimestamp, inputClass, primaryButton, safeText, secondaryButton } from './format';
import { useRecoveryGate } from './gate';
import { Notice } from './Notice';
import { PagedList } from './PagedList';

interface AutomationPanelProps {
  projectId: string;
  state: RecoveryState | null;
  onChanged: () => Promise<void>;
}

function idleProblem(text: string): string | null {
  const value = Number(text);
  return text.trim() !== '' && Number.isInteger(value) && value >= 1 && value <= 60 ? null : 'Enter a whole number of minutes from 1 to 60.';
}

export function AutomationPanel({ projectId, state, onChanged }: AutomationPanelProps) {
  const { call, busy, repairPending } = useRecoveryGate();
  const status = useAutomationStatus(projectId);
  const switchId = useId();
  const idleId = useId();
  const [enabled, setEnabled] = useState(false);
  const [idle, setIdle] = useState('5');
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState<CheckpointPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const dirtyRef = useRef(false);
  const reviewed = useRef<Set<string> | null>(null);
  const [appeared, setAppeared] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkNote, setCheckNote] = useState<{ tone: 'success' | 'info' | 'error'; text: string } | null>(null);

  const sourceAvailable = state?.sourceAvailable ?? false;
  const stored = state?.settings;
  const settingsError = state?.settingsError;

  // Follow the engine's settings until the user starts editing; edits are never overwritten by a reload.
  useEffect(() => {
    if (!stored || dirtyRef.current) return;
    setEnabled(stored.automaticEnabled);
    setIdle(String(stored.idleMinutes));
    setExcluded(new Set(stored.excludedPaths ?? []));
  }, [stored]);

  const refreshPreview = useCallback(async () => {
    setPreviewError(null);
    try {
      const next = await call('Checking current files…', { action: 'preview' });
      // A refresh is a review, not an approval: say what is new instead of silently including it.
      const previous = reviewed.current;
      setAppeared(previous ? next.coverage.included.map((file) => file.path).filter((path) => !previous.has(path)) : []);
      reviewed.current = new Set(next.coverage.included.map((file) => file.path));
      setPreview(next);
    } catch (error) {
      setPreview(null);
      setPreviewError(errorMessage(error));
    }
  }, [call]);

  useEffect(() => {
    if (sourceAvailable) void refreshPreview();
  }, [sourceAvailable, refreshPreview]);

  if (!state) return <p className="text-sm text-gray-500 dark:text-gray-400">Saved history has not loaded yet. Use Retry above.</p>;

  const eligible = new Set(preview?.coverage.included.map((file) => file.path) ?? []);
  const absent = [...excluded].filter((path) => !eligible.has(path)).sort();
  const nextSave = preview ? preview.coverage.included.filter((file) => !excluded.has(file.path)) : null;
  const newFiles = appeared.filter((path) => !excluded.has(path));
  const idleError = idleProblem(idle);
  const canSave = busy === null && idleError === null && (dirty || Boolean(settingsError));
  const edit = () => {
    dirtyRef.current = true;
    setDirty(true);
  };

  const counts = { manual: 0, automatic: 0, safety: 0 };
  let coveredBytes = 0;
  for (const checkpoint of state.checkpoints) {
    counts[checkpoint.kind] += 1;
    coveredBytes += checkpoint.coverage.totalBytes;
  }

  const save = async () => {
    setSaveError(null);
    setSavedAt(null);
    setSaving(true);
    try {
      const result = await call(
        'Saving automatic-save settings…',
        { action: 'settings', settings: { automaticEnabled: enabled, idleMinutes: Number(idle), retention: 'keep_all', excludedPaths: [...excluded].sort() } },
        { mutating: true },
      );
      noteRecoverySettings(projectId, result);
      setEnabled(result.automaticEnabled);
      setIdle(String(result.idleMinutes));
      setExcluded(new Set(result.excludedPaths ?? []));
      dirtyRef.current = false;
      setDirty(false);
      setSavedAt(new Date().toISOString());
      await onChanged();
    } catch (error) {
      setSaveError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const checkNow = async () => {
    setCheckNote(null);
    setChecking(true);
    try {
      const result = await call('Checking whether an automatic save is due…', { action: 'autoTick' }, { mutating: true });
      noteRecoveryTick(projectId, { result });
      setCheckNote({ tone: result.checkpoint ? 'success' : 'info', text: describeTickReason(result.reason, state.settings.idleMinutes) });
      if (result.checkpoint) await onChanged();
    } catch (error) {
      const message = errorMessage(error);
      noteRecoveryTick(projectId, { error: message });
      setCheckNote({ tone: 'error', text: message });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="space-y-2">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Automatic saves keep a version of your project after your files have stayed unchanged for a while, so a good moment is not lost if you forget to save one.
          They are <strong>off</strong> until you turn them on for this project.
        </p>
        <Notice tone="info">
          Automatic saves are only made while BitGit is open (or when a script you run asks for one). Nothing runs when BitGit is closed and no background service is
          installed. They never change your files or Git history and never upload anything. Identical content is not saved twice.
        </Notice>
      </div>

      {settingsError && (
        <Notice tone="warning" title="The automatic-save settings could not be read">
          {safeText(settingsError)}
          {'\nAutomatic saves are off until you save settings below. Your saved versions are not affected. The form shows safe defaults: check them, then choose Save settings.'}
        </Notice>
      )}

      <section aria-labelledby={`${switchId}-title`} className="space-y-4">
        <h3 id={`${switchId}-title`} className="text-sm font-semibold text-gray-900 dark:text-white">
          Settings
        </h3>
        <div className="flex items-center gap-3">
          <button
            id={switchId}
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Save automatically"
            disabled={saving}
            onClick={() => {
              setEnabled(!enabled);
              edit();
            }}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 disabled:opacity-50 ${
              enabled ? 'bg-teal-600' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
          <label htmlFor={switchId} className="text-sm font-medium text-gray-800 dark:text-gray-200 cursor-pointer">
            Save automatically while BitGit is open: <strong>{enabled ? 'On' : 'Off'}</strong>
          </label>
        </div>

        <div className="max-w-xs">
          <label htmlFor={idleId} className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
            Save after files are unchanged for (minutes)
          </label>
          <input
            id={idleId}
            type="number"
            min={1}
            max={60}
            step={1}
            value={idle}
            onChange={(event) => {
              setIdle(event.target.value);
              edit();
            }}
            className={inputClass}
            disabled={saving}
            aria-invalid={idleError !== null}
          />
          {idleError ? (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">{idleError}</p>
          ) : (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Whole minutes, 1 to 60. Editing your files restarts the wait.</p>
          )}
        </div>

        <div className="p-3 text-sm space-y-1 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900/30">
          <p className="font-medium text-gray-900 dark:text-white">Retention: keep everything</p>
          <p className="text-gray-700 dark:text-gray-300">
            BitGit never deletes an automatic save, or any other saved version. History currently holds <strong>{state.checkpoints.length}</strong> version
            {state.checkpoints.length === 1 ? '' : 's'} ({counts.automatic} automatic, {counts.manual} saved by you, {counts.safety} safety cop{counts.safety === 1 ? 'y' : 'ies'}).
          </p>
          <p className="text-gray-700 dark:text-gray-300">
            Added up per version they cover <strong>{formatBytes(coveredBytes)}</strong> of files. Identical files are stored once in history, so the folder on disk is
            usually smaller than that total.
            {nextSave && (
              <>
                {' '}
                With the current exclusions the next automatic save would cover {nextSave.length} file{nextSave.length === 1 ? '' : 's'} (
                {formatBytes(nextSave.reduce((sum, file) => sum + file.sizeBytes, 0))}).
              </>
            )}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Stored at <span className="font-mono break-all">{safeText(state.vaultPath)}</span>
          </p>
        </div>
      </section>

      <section aria-labelledby={`${idleId}-exclusions`} className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id={`${idleId}-exclusions`} className="text-sm font-semibold text-gray-900 dark:text-white">
            Files to leave out of automatic saves
          </h3>
          {sourceAvailable && (
            <button type="button" className={secondaryButton} onClick={() => void refreshPreview()} disabled={busy !== null}>
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              Re-check current files
            </button>
          )}
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          This applies to automatic saves only; when you save a version yourself you choose its files there. New files are included unless you leave them out here, so
          review the list again after adding files you do not want saved.
        </p>

        {!sourceAvailable && (
          <Notice tone="warning" title="The project folder was not found">
            The file list cannot be checked, so exclusions cannot be reviewed now. {excluded.size} configured exclusion{excluded.size === 1 ? ' is' : 's are'} kept as they are.
          </Notice>
        )}
        {previewError && (
          <Notice
            tone="error"
            title="Could not check the current files"
            actions={
              <button type="button" className={secondaryButton} onClick={() => void refreshPreview()} disabled={busy !== null}>
                Try again
              </button>
            }
          >
            {previewError}
          </Notice>
        )}
        {sourceAvailable && !preview && !previewError && (
          <p className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            Checking which files are eligible…
          </p>
        )}
        {newFiles.length > 0 && (
          <Notice tone="info" title={`${newFiles.length} new file${newFiles.length === 1 ? '' : 's'} since your last review`}>
            {newFiles.slice(0, 5).map((path) => safeText(path)).join(', ')}
            {newFiles.length > 5 ? `, and ${newFiles.length - 5} more` : ''}. They are included in automatic saves unless you untick them below.
          </Notice>
        )}
        {preview && (
          <CoverageView
            coverage={preview.coverage}
            selection={{
              excluded,
              onChange: (next) => {
                setExcluded(next);
                edit();
              },
              disabled: busy !== null,
              labels: { heading: 'Choose files for automatic saves', help: 'Unchecked files are left out of automatic saves.' },
            }}
          />
        )}

        {absent.length > 0 && (
          <details open className="border border-gray-200 dark:border-gray-700 rounded-lg">
            <summary className="px-3 py-2 text-sm font-medium cursor-pointer text-gray-800 dark:text-gray-200">
              Configured exclusions with no eligible file now ({absent.length})
            </summary>
            <div className="px-3 pb-3 space-y-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {preview
                  ? 'These paths are missing or already skipped by BitGit. They stay configured, so if a file appears there later it is still left out. Remove one to include it again.'
                  : 'These paths are kept as configured. Remove one to include it again.'}
              </p>
              <PagedList
                items={absent}
                step={50}
                itemKey={(path) => path}
                className="divide-y divide-gray-100 dark:divide-gray-700"
                renderItem={(path) => (
                  <div className="flex items-center gap-2 py-1 text-xs">
                    <span className="min-w-0 flex-1 font-mono break-all text-gray-800 dark:text-gray-200">{safeText(path)}</span>
                    <button
                      type="button"
                      className={secondaryButton}
                      disabled={busy !== null}
                      aria-label={`Remove the exclusion for ${safeText(path)}`}
                      onClick={() => {
                        const next = new Set(excluded);
                        next.delete(path);
                        setExcluded(next);
                        edit();
                      }}
                    >
                      <X className="w-4 h-4" aria-hidden="true" />
                      Remove
                    </button>
                  </div>
                )}
              />
            </div>
          </details>
        )}
      </section>

      {saveError && (
        <Notice tone="error" title="The settings were not saved">
          {saveError}
        </Notice>
      )}
      {savedAt && !dirty && (
        <Notice tone="success" title="Settings saved">
          Automatic saves are {enabled ? 'on' : 'off'} for this project{enabled ? `, after ${idle} minute${Number(idle) === 1 ? '' : 's'} without changes` : ''}. Saved{' '}
          {formatTimestamp(savedAt)}.
        </Notice>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={primaryButton} onClick={() => void save()} disabled={!canSave}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Save className="w-4 h-4" aria-hidden="true" />}
          Save settings
        </button>
        {!dirty && !settingsError && <span className="text-xs text-gray-500 dark:text-gray-400">No changes to save.</span>}
      </div>

      <section aria-labelledby={`${switchId}-status`} className="space-y-3">
        <h3 id={`${switchId}-status`} className="text-sm font-semibold text-gray-900 dark:text-white">
          What automatic saves have done
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          While BitGit is open and this window is closed, it checks about every {Math.round(TICK_INTERVAL_MS / 1000)} seconds. Automatic checks are paused for this
          project while this window is open; use the button below to run one now.
        </p>
        {status?.lastTick ? (
          <p className="text-sm text-gray-800 dark:text-gray-200">
            <Clock className="inline w-4 h-4 mr-1 -mt-0.5" aria-hidden="true" />
            Last check {formatRelative(status.lastTick.at) || 'just now'} ({formatTimestamp(status.lastTick.at)}): {describeTickReason(status.lastTick.reason, status.idleMinutes)}
          </p>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">No automatic check has run since BitGit opened.</p>
        )}
        {status?.lastSave && (
          <p className="text-sm text-gray-800 dark:text-gray-200">
            Last automatic save since BitGit opened: “{safeText(status.lastSave.label)}”, {formatRelative(status.lastSave.at) || 'just now'}.
          </p>
        )}
        {status?.error && (
          <Notice tone="error" title="The latest automatic check failed">
            {status.error.message}
            {'\n'}Failed {formatRelative(status.error.at) || 'just now'}
            {status.error.retryAt ? `; BitGit will try again after ${formatTimestamp(status.error.retryAt)} (it waits longer after each failure).` : '.'}
          </Notice>
        )}
        {repairPending && <p className="text-xs text-gray-600 dark:text-gray-400">Automatic saves and checks are paused until the interrupted repair is undone.</p>}
        {checkNote && (
          <Notice tone={checkNote.tone}>{checkNote.text}</Notice>
        )}
        <button
          type="button"
          className={secondaryButton}
          onClick={() => void checkNow()}
          disabled={busy !== null || !sourceAvailable || repairPending || !stored?.automaticEnabled || dirty}
        >
          {checking ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="w-4 h-4" aria-hidden="true" />}
          {status?.error ? 'Retry the check now' : 'Run a check now'}
        </button>
        {(!stored?.automaticEnabled || dirty) && (
          <p className="text-xs text-gray-500 dark:text-gray-400">{dirty ? 'Save your settings to run a check.' : 'Turn automatic saves on and save the settings to run a check.'}</p>
        )}
      </section>
    </div>
  );
}
