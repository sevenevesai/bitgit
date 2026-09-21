import { useState } from 'react';
import { Loader2, Wrench } from 'lucide-react';
import type { Checkpoint, RecoveryChange, RecoveryComparison, RecoveryReceipt } from '../../types/recovery';
import { errorMessage, looksStale } from '../../lib/recovery';
import { dangerButton, formatTimestamp, safeText, secondaryButton, shortId } from './format';
import { useRecoveryGate } from './gate';
import { Notice } from './Notice';
import { PagedList } from './PagedList';

interface RepairPanelProps {
  checkpoint: Checkpoint;
  comparison: RecoveryComparison;
  comparedAt: string;
  selected: RecoveryChange[];
  onRepaired: (receipt: RecoveryReceipt) => Promise<void>;
  onCompareAgain: () => void;
}

const count = (changes: RecoveryChange[], kind: RecoveryChange['kind']) => changes.filter((change) => change.kind === kind).length;

export function RepairPanel({ checkpoint, comparison, comparedAt, selected, onRepaired, onCompareAgain }: RepairPanelProps) {
  const { call, busy } = useRecoveryGate();
  const [confirming, setConfirming] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const replaced = count(selected, 'replace');
  const added = count(selected, 'add');
  const deleted = count(selected, 'delete');

  const repair = async () => {
    setError(null);
    setRepairing(true);
    try {
      const receipt = await call(
        'Saving safety copy and repairing files…',
        {
          action: 'repair',
          checkpointId: checkpoint.id,
          paths: selected.map((change) => change.path),
          expectedFingerprint: comparison.currentFingerprint,
        },
        { mutating: true },
      );
      setConfirming(false);
      await onRepaired(receipt);
    } catch (repairError) {
      setError(errorMessage(repairError));
    } finally {
      setRepairing(false);
    }
  };

  if (selected.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        To repair specific files in your project, tick them above. Nothing changes until you confirm.
      </p>
    );
  }

  return (
    <div className="space-y-3 p-3 border border-orange-300 dark:border-orange-800 rounded-lg bg-orange-50/50 dark:bg-orange-900/10">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Repair {selected.length} selected file{selected.length === 1 ? '' : 's'}</h4>
      <ul className="text-sm text-gray-700 dark:text-gray-300 list-disc pl-5">
        {replaced > 0 && <li>{replaced} will be overwritten with the saved version</li>}
        {added > 0 && <li>{added} missing from your project will be created</li>}
        {deleted > 0 && <li>{deleted} not in the saved version will be deleted from your project</li>}
      </ul>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Based on the comparison from {formatTimestamp(comparedAt)} (current files fingerprint {shortId(comparison.currentFingerprint, 12)}). If your files
        changed since then, the repair is refused and you can compare again.
      </p>

      {error && (
        <Notice
          tone="error"
          title="The repair did not finish"
          actions={
            <button type="button" className={secondaryButton} onClick={onCompareAgain} disabled={busy !== null}>
              Compare again
            </button>
          }
        >
          {error}
          {looksStale(error) && '\nYour files changed after this comparison. Compare again, then select the files again.'}
        </Notice>
      )}

      {!confirming ? (
        <button type="button" className={dangerButton} onClick={() => setConfirming(true)} disabled={busy !== null}>
          <Wrench className="w-4 h-4" aria-hidden="true" />
          Review repair…
        </button>
      ) : (
        <div className="space-y-3" role="group" aria-label="Confirm repair">
          <Notice tone="warning" title={`This changes ${selected.length} file${selected.length === 1 ? '' : 's'} in your project folder`}>
            BitGit first saves all your current files as a safety copy, then changes only the files below. You can go back by recovering the safety copy.
          </Notice>
          <div className="max-h-40 overflow-y-auto">
            <PagedList
              items={selected}
              step={30}
              itemKey={(change) => change.path}
              className="divide-y divide-orange-100 dark:divide-orange-900/40"
              renderItem={(change) => (
                <div className="flex gap-2 py-1 text-xs">
                  <span className="w-16 shrink-0 font-medium text-gray-600 dark:text-gray-400">{change.kind === 'replace' ? 'overwrite' : change.kind === 'add' ? 'create' : 'delete'}</span>
                  <span className="font-mono break-all text-gray-800 dark:text-gray-200">{safeText(change.path)}</span>
                </div>
              )}
            />
          </div>
          <div className="flex gap-2">
            <button type="button" className={dangerButton} onClick={() => void repair()} disabled={busy !== null}>
              {repairing ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Wrench className="w-4 h-4" aria-hidden="true" />}
              Save safety copy and repair {selected.length} file{selected.length === 1 ? '' : 's'}
            </button>
            <button type="button" className={secondaryButton} onClick={() => setConfirming(false)} disabled={busy !== null}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
