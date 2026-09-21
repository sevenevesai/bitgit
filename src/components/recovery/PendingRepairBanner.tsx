import { useState } from 'react';
import { Loader2, Undo2 } from 'lucide-react';
import type { Checkpoint, RecoveryReceipt, RecoveryState } from '../../types/recovery';
import { errorMessage } from '../../lib/recovery';
import { dangerButton, formatTimestamp, safeText, secondaryButton, shortId } from './format';
import { useRecoveryGate } from './gate';
import { Notice } from './Notice';

interface PendingRepairBannerProps {
  pending: NonNullable<RecoveryState['pendingRepair']>;
  checkpoints: readonly Checkpoint[];
  onOpenCheckpoint: (id: string) => void;
  onRolledBack: (receipt: RecoveryReceipt) => void;
  onChanged: () => Promise<void>;
}

// Shown whenever the engine reports an unfinished repair, including after BitGit was closed mid-repair.
// Undoing is always an explicit click; reading state never rewrites files.
export function PendingRepairBanner({ pending, checkpoints, onOpenCheckpoint, onRolledBack, onChanged }: PendingRepairBannerProps) {
  const { call, busy } = useRecoveryGate();
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const safety = checkpoints.find((checkpoint) => checkpoint.id === pending.safetyCheckpointId) ?? null;
  const files = `${pending.affectedFiles} file${pending.affectedFiles === 1 ? '' : 's'}`;

  const undo = async () => {
    setError(null);
    setWorking(true);
    try {
      const receipt = await call('Undoing the interrupted repair…', { action: 'repairRollback' }, { mutating: true });
      setConfirming(false);
      onRolledBack(receipt);
    } catch (undoError) {
      setError(errorMessage(undoError));
    } finally {
      try { await onChanged(); } catch (refreshError) {
        setError(previous => [previous, `Could not refresh repair status: ${errorMessage(refreshError)}`].filter(Boolean).join('\n'));
      }
      setWorking(false);
    }
  };

  return (
    <div className="space-y-2">
      <Notice
        tone="warning"
        title="A file repair was interrupted"
        actions={
          <>
            <button type="button" className={secondaryButton} onClick={() => onOpenCheckpoint(pending.safetyCheckpointId)} disabled={!safety}>
              Open safety copy
            </button>
            {!confirming && (
              <button type="button" className={dangerButton} onClick={() => setConfirming(true)} disabled={busy !== null}>
                <Undo2 className="w-4 h-4" aria-hidden="true" />
                Undo the interrupted repair…
              </button>
            )}
          </>
        }
      >
        A repair that started {formatTimestamp(pending.startedAt)} was changing {files} and did not finish, so some of your files may be half-repaired.
        {'\n'}Safety copy made just before it: {safety ? <strong>{safeText(safety.label) || '(unnamed)'}</strong> : 'not found in this history'} (
        <span className="font-mono">{shortId(pending.safetyCheckpointId)}</span>).
        {'\n'}Until this is resolved, saving new versions, repairing files and automatic saves are paused for this project. Comparing, recovering copies and
        restoring from a remote still work.
      </Notice>

      {confirming && (
        <div role="group" aria-label="Confirm undoing the interrupted repair" className="space-y-2">
          <Notice tone="warning" title={`Put ${files} back as they were before the repair?`}>
            BitGit will restore the {files} the repair was changing to their earlier contents. If you edited any of them since the repair stopped, BitGit stops and
            leaves them alone. In that case keep your edits, and recover the safety copy into a separate folder instead.
          </Notice>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={dangerButton} onClick={() => void undo()} disabled={busy !== null}>
              {working ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Undo2 className="w-4 h-4" aria-hidden="true" />}
              Undo interrupted repair
            </button>
            <button type="button" className={secondaryButton} onClick={() => setConfirming(false)} disabled={busy !== null}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <Notice
          tone="error"
          title="The interrupted repair was not undone"
          actions={
            <button type="button" className={secondaryButton} onClick={() => onOpenCheckpoint(pending.safetyCheckpointId)} disabled={!safety}>
              Open safety copy to recover it separately
            </button>
          }
        >
          {error}
          {'\nIf the message mentions newer edits, keep those files as they are and use Recover copy on the safety copy to write its files into a separate folder; nothing in your project is overwritten that way.'}
        </Notice>
      )}
    </div>
  );
}
