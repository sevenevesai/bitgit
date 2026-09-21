import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, FilePlus, FileMinus, FileDiff, Loader2, RefreshCw } from 'lucide-react';
import type { Checkpoint, RecoveryChange, RecoveryComparison, RecoveryReceipt } from '../../types/recovery';
import { errorMessage } from '../../lib/recovery';
import { formatTimestamp, safeText, secondaryButton, shortId } from './format';
import { useRecoveryGate } from './gate';
import { Notice } from './Notice';
import { PagedList } from './PagedList';
import { RepairPanel } from './RepairPanel';

interface CompareViewProps {
  checkpoint: Checkpoint;
  sourceAvailable: boolean;
  onChanged: () => Promise<void>;
  onOpenCheckpoint: (id: string) => void;
}

const KIND_INFO: Record<RecoveryChange['kind'], { label: string; help: string; icon: typeof FilePlus; tone: string }> = {
  add: {
    label: 'Would be added',
    help: 'In the saved version, missing from your project now',
    icon: FilePlus,
    tone: 'text-green-700 dark:text-green-400',
  },
  replace: {
    label: 'Would be replaced',
    help: 'Differs from your project now',
    icon: FileDiff,
    tone: 'text-yellow-700 dark:text-yellow-400',
  },
  delete: {
    label: 'Would be deleted',
    help: 'In your project now, not in the saved version',
    icon: FileMinus,
    tone: 'text-red-700 dark:text-red-400',
  },
};

function TextPane({ title, text }: { title: string; text: string | null }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">{title}</div>
      {text === null ? (
        <div className="p-2 text-xs italic text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-600 rounded">
          No file here
        </div>
      ) : (
        <pre className="p-2 text-xs font-mono overflow-auto max-h-60 whitespace-pre-wrap break-words bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded text-gray-800 dark:text-gray-200">
          {text === '' ? '(empty file)' : text}
        </pre>
      )}
    </div>
  );
}

function ChangeDetails({ change }: { change: RecoveryChange }) {
  if (change.binary) {
    return <p className="p-2 text-xs text-gray-500 dark:text-gray-400">Binary file — contents are not shown.</p>;
  }
  return (
    <div className="space-y-2 p-2">
      <div className="grid gap-2 md:grid-cols-2">
        <TextPane title="In your project now" text={change.before} />
        <TextPane title="In the saved version" text={change.after} />
      </div>
      {change.truncated && <p className="text-xs text-yellow-700 dark:text-yellow-400">Preview truncated — the file is larger than what is shown.</p>}
    </div>
  );
}

function ChangeRow({
  change,
  checked,
  onToggle,
}: {
  change: RecoveryChange;
  checked: boolean;
  onToggle: () => void;
}) {
  const [open, setOpen] = useState(false);
  const info = KIND_INFO[change.kind];
  const Icon = info.icon;
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)} className="group">
      <summary className="flex items-center gap-2 py-1.5 px-1 text-xs cursor-pointer list-none hover:bg-gray-50 dark:hover:bg-gray-700/40">
        <ChevronRight className="w-3.5 h-3.5 shrink-0 text-gray-400 transition-transform group-open:rotate-90" aria-hidden="true" />
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          onClick={(event) => event.stopPropagation()}
          aria-label={`Select ${safeText(change.path)} for repair`}
          className="w-4 h-4 text-teal-600 rounded focus:ring-2 focus:ring-teal-500"
        />
        <Icon className={`w-4 h-4 shrink-0 ${info.tone}`} aria-hidden="true" />
        <span className={`w-28 shrink-0 font-medium ${info.tone}`} title={info.help}>
          {info.label}
        </span>
        <span className="min-w-0 flex-1 font-mono break-all text-gray-800 dark:text-gray-200">{safeText(change.path)}</span>
        {change.binary && <span className="shrink-0 text-gray-500 dark:text-gray-400">binary</span>}
        {change.truncated && <span className="shrink-0 text-gray-500 dark:text-gray-400">truncated</span>}
      </summary>
      {open && <ChangeDetails change={change} />}
    </details>
  );
}

export function CompareView({ checkpoint, sourceAvailable, onChanged, onOpenCheckpoint }: CompareViewProps) {
  const { call, busy } = useRecoveryGate();
  const [comparison, setComparison] = useState<RecoveryComparison | null>(null);
  const [comparedAt, setComparedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [repaired, setRepaired] = useState<RecoveryReceipt | null>(null);

  const compare = useCallback(async () => {
    setError(null);
    setRepaired(null);
    try {
      const result = await call('Comparing with current files…', { action: 'compare', checkpointId: checkpoint.id });
      const paths = new Set(result.changes.map((change) => change.path));
      setComparison(result);
      setComparedAt(new Date().toISOString());
      setSelected((previous) => new Set([...previous].filter((path) => paths.has(path))));
    } catch (compareError) {
      setComparison(null);
      setComparedAt(null);
      setError(errorMessage(compareError));
    }
  }, [call, checkpoint.id]);

  useEffect(() => {
    if (sourceAvailable) void compare();
  }, [sourceAvailable, compare]);

  if (!sourceAvailable) {
    return (
      <Notice tone="warning" title="Comparing needs the project folder">
        The project folder was not found, so this saved version cannot be compared with current files or used to repair files. You can still recover it
        into a new folder.
      </Notice>
    );
  }

  const toggle = (path: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectedChanges = comparison ? comparison.changes.filter((change) => selected.has(change.path)) : [];
  const counts = comparison
    ? {
        add: comparison.changes.filter((change) => change.kind === 'add').length,
        replace: comparison.changes.filter((change) => change.kind === 'replace').length,
        delete: comparison.changes.filter((change) => change.kind === 'delete').length,
      }
    : null;

  const safetyId = repaired?.safetyCheckpointId;

  const afterRepair = async (receipt: RecoveryReceipt) => {
    setRepaired(receipt);
    setComparison(null);
    setComparedAt(null);
    setSelected(new Set());
    await onChanged();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          What restoring this saved version over your current files would do. Recovering into a new folder never changes your project.
        </p>
        <button type="button" className={secondaryButton} onClick={() => void compare()} disabled={busy !== null}>
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          Compare again
        </button>
      </div>

      {repaired && (
        <Notice
          tone="success"
          title={`Repaired ${repaired.fileCount} file${repaired.fileCount === 1 ? '' : 's'} — verified ${formatTimestamp(repaired.verifiedAt)}`}
          actions={
            safetyId ? (
              <button type="button" className={secondaryButton} onClick={() => onOpenCheckpoint(safetyId)}>
                Open safety copy
              </button>
            ) : undefined
          }
        >
          {safetyId
            ? `Your files from just before the repair were saved as safety copy ${shortId(safetyId)}. Recover it to go back. Compare again to see the current state.`
            : 'The engine did not report a safety copy for this repair. Compare again to see the current state.'}
        </Notice>
      )}

      {error && (
        <Notice tone="error" title="Could not compare with the current files">
          {error}
          {'\nYou can still recover this saved version into a new folder.'}
        </Notice>
      )}

      {!comparison && !error && !repaired && (
        <p className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Comparing…
        </p>
      )}

      {comparison && counts && comparedAt && (
        <div className="space-y-3">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            <strong>{comparison.changes.length}</strong> file{comparison.changes.length === 1 ? '' : 's'} differ ({counts.add} to add, {counts.replace} to
            replace, {counts.delete} to delete); {comparison.unchangedCount} unchanged. Compared {formatTimestamp(comparedAt)}.
          </p>

          {comparison.warnings.length > 0 && (
            <Notice tone="warning" title="Comparison warnings">
              <ul className="list-disc pl-4 space-y-0.5">
                {comparison.warnings.map((warning, index) => (
                  <li key={`${index}-${warning}`}>{safeText(warning)}</li>
                ))}
              </ul>
            </Notice>
          )}

          {comparison.changes.length === 0 ? (
            <Notice tone="info">Your current files match this saved version.</Notice>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span>{selected.size} selected for repair</span>
                <button
                  type="button"
                  className={secondaryButton}
                  disabled={busy !== null}
                  onClick={() => setSelected(new Set(comparison.changes.map((change) => change.path)))}
                >
                  Select all {comparison.changes.length}
                </button>
                <button type="button" className={secondaryButton} disabled={busy !== null || selected.size === 0} onClick={() => setSelected(new Set())}>
                  Clear selection
                </button>
              </div>
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg max-h-96 overflow-y-auto p-1">
                <PagedList
                  items={comparison.changes}
                  step={100}
                  itemKey={(change) => change.path}
                  className="divide-y divide-gray-100 dark:divide-gray-700"
                  renderItem={(change) => (
                    <ChangeRow change={change} checked={selected.has(change.path)} onToggle={() => toggle(change.path)} />
                  )}
                />
              </div>
            </div>
          )}

          {comparison.changes.length > 0 && (
            <RepairPanel
              key={`${comparison.currentFingerprint}-${comparedAt}`}
              checkpoint={checkpoint}
              comparison={comparison}
              comparedAt={comparedAt}
              selected={selectedChanges}
              onRepaired={afterRepair}
              onFailed={onChanged}
              onCompareAgain={() => void compare()}
            />
          )}
        </div>
      )}
    </div>
  );
}
