import { useCallback, useEffect, useId, useState } from 'react';
import { GitBranch, Loader2, RefreshCw, Save } from 'lucide-react';
import type { Checkpoint, CheckpointPreview, RecoveryState } from '../../types/recovery';
import { errorMessage, looksStale } from '../../lib/recovery';
import { CoverageView } from './CoverageView';
import { formatBytes, formatTimestamp, inputClass, primaryButton, safeText, secondaryButton, shortId } from './format';
import { useRecoveryGate } from './gate';
import { Notice } from './Notice';

interface SaveCheckpointProps {
  state: RecoveryState | null;
  projectPath: string;
  onSaved: (checkpoint: Checkpoint) => Promise<void>;
  onOpenCheckpoint: (id: string) => void;
}

export function SaveCheckpoint({ state, projectPath, onSaved, onOpenCheckpoint }: SaveCheckpointProps) {
  const { call, busy } = useRecoveryGate();
  const nameId = useId();
  const noteId = useId();
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<CheckpointPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Checkpoint | null>(null);
  const [saving, setSaving] = useState(false);

  const sourceAvailable = state?.sourceAvailable ?? null;

  const refreshPreview = useCallback(async () => {
    setPreviewError(null);
    try {
      setPreview(await call('Checking current files…', { action: 'preview' }));
    } catch (error) {
      setPreview(null);
      setPreviewError(errorMessage(error));
    }
  }, [call]);

  useEffect(() => {
    if (sourceAvailable) void refreshPreview();
  }, [sourceAvailable, refreshPreview]);

  if (state === null) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Saved history has not loaded yet. Use Retry above.</p>;
  }

  if (!state.sourceAvailable) {
    return (
      <Notice tone="warning" title="The project folder was not found">
        <span className="font-mono break-all">{safeText(projectPath)}</span>
        {'\n'}A new version can only be saved from the project folder. Earlier saved versions are still listed under History, and you can recover
        them into a new folder.
      </Notice>
    );
  }

  const includedPaths = preview?.coverage.included.map((file) => file.path) ?? [];
  const selectedCount = includedPaths.filter((path) => !excluded.has(path)).length;
  const nameMissing = label.trim() === '';
  const canSave = !busy && preview !== null && !nameMissing && selectedCount > 0;

  const save = async () => {
    if (!preview) return;
    setSaveError(null);
    setSaved(null);
    setSaving(true);
    try {
      const checkpoint = await call(
        'Saving version…',
        {
          action: 'create',
          label: label.trim(),
          note: note.trim() || undefined,
          kind: 'manual',
          expectedFingerprint: preview.fingerprint,
          excludedPaths: includedPaths.filter((path) => excluded.has(path)),
        },
        { mutating: true },
      );
      setSaved(checkpoint);
      setLabel('');
      setNote('');
      await onSaved(checkpoint);
    } catch (error) {
      setSaveError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        A saved version is a copy of your project files kept on this computer. It does not need GitHub and does not change your files or Git history.
        Nothing checks that the saved code runs.
      </p>

      {saved && (
        <Notice
          tone="success"
          title={`Saved “${safeText(saved.label)}” locally`}
          actions={
            <button type="button" className={secondaryButton} onClick={() => onOpenCheckpoint(saved.id)}>
              View in History
            </button>
          }
        >
          {formatTimestamp(saved.createdAt)} · {saved.coverage.included.length} files · {formatBytes(saved.coverage.totalBytes)}. This is a local copy
          only; it has not been copied to a remote.
        </Notice>
      )}

      <div className="space-y-3">
        <div>
          <label htmlFor={nameId} className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
            Name <span className="text-red-600 dark:text-red-400">(required)</span>
          </label>
          <input
            id={nameId}
            type="text"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="e.g. Before switching to the new checkout flow"
            className={inputClass}
            disabled={saving}
            aria-required="true"
          />
        </div>
        <div>
          <label htmlFor={noteId} className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
            Note <span className="text-gray-400">(optional)</span>
          </label>
          <textarea
            id={noteId}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            placeholder="What was working, what you were about to try"
            className={inputClass}
            disabled={saving}
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">What will be saved</h3>
          <button type="button" className={secondaryButton} onClick={() => void refreshPreview()} disabled={busy !== null}>
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Re-check current files
          </button>
        </div>

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

        {!preview && !previewError && (
          <p className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            Checking which files are eligible…
          </p>
        )}

        {preview && (
          <>
            <p className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <GitBranch className="w-3.5 h-3.5" aria-hidden="true" />
              {preview.branch ? `Branch ${safeText(preview.branch)}` : 'No Git branch'}
              {preview.head ? ` · HEAD ${shortId(preview.head)}` : ' · no commits yet'}
            </p>
            <CoverageView coverage={preview.coverage} selection={{ excluded, onChange: setExcluded, disabled: busy !== null }} />
          </>
        )}
      </div>

      {saveError && (
        <Notice
          tone="error"
          title="The version was not saved"
          actions={
            <button type="button" className={secondaryButton} onClick={() => void refreshPreview()} disabled={busy !== null}>
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              Refresh preview
            </button>
          }
        >
          {saveError}
          {looksStale(saveError) && '\nYour files changed after the preview was taken. Refresh the preview, check the file list, then save again.'}
        </Notice>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={primaryButton} onClick={() => void save()} disabled={!canSave}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Save className="w-4 h-4" aria-hidden="true" />}
          Save version
        </button>
        {nameMissing && <span className="text-xs text-gray-500 dark:text-gray-400">Enter a name to save.</span>}
        {!nameMissing && preview && selectedCount === 0 && (
          <span className="text-xs text-gray-500 dark:text-gray-400">Select at least one file to save.</span>
        )}
      </div>
    </div>
  );
}
