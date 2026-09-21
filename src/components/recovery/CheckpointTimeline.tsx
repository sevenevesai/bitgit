import { AlertTriangle, ClipboardCheck, Cloud, FolderCheck, GitBranch } from 'lucide-react';
import type { Checkpoint } from '../../types/recovery';
import { backupStatus, formatBytes, formatRelative, formatTimestamp, kindBadgeClass, kindLabel, safeText } from './format';

interface CheckpointTimelineProps {
  checkpoints: readonly Checkpoint[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

// Newest first; equal or unparseable times keep the order the engine returned.
export function sortNewestFirst(checkpoints: readonly Checkpoint[]): Checkpoint[] {
  return checkpoints
    .map((checkpoint, index) => ({ checkpoint, index, time: new Date(checkpoint.createdAt).getTime() }))
    .sort((a, b) => (Number.isNaN(b.time) ? 0 : b.time) - (Number.isNaN(a.time) ? 0 : a.time) || a.index - b.index)
    .map((entry) => entry.checkpoint);
}

export function CheckpointTimeline({ checkpoints, selectedId, onSelect }: CheckpointTimelineProps) {
  if (checkpoints.length === 0) {
    return (
      <div className="p-4 text-sm text-gray-600 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
        No saved versions yet. Use <strong>Save</strong> to keep the first one, or <strong>Restore from remote</strong> to bring one back.
      </div>
    );
  }

  return (
    <ol aria-label="Saved versions, newest first" className="space-y-2">
      {checkpoints.map((checkpoint) => {
        const selected = checkpoint.id === selectedId;
        return (
          <li key={checkpoint.id}>
            <button
              type="button"
              onClick={() => onSelect(checkpoint.id)}
              aria-current={selected ? 'true' : undefined}
              className={`w-full p-3 text-left border rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                selected
                  ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-sm text-gray-900 dark:text-white break-words min-w-0">{safeText(checkpoint.label) || '(unnamed)'}</span>
                <span className={`shrink-0 px-2 py-0.5 text-xs rounded-full ${kindBadgeClass(checkpoint.kind)}`}>{kindLabel(checkpoint.kind)}</span>
              </div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400" title={formatTimestamp(checkpoint.createdAt)}>
                Saved locally {formatRelative(checkpoint.createdAt) || formatTimestamp(checkpoint.createdAt)}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                {checkpoint.branch && (
                  <span className="inline-flex items-center gap-1">
                    <GitBranch className="w-3 h-3" aria-hidden="true" />
                    {safeText(checkpoint.branch)}
                  </span>
                )}
                <span>{formatBytes(checkpoint.coverage.totalBytes)}</span>
                {checkpoint.metadataError && <span className="text-yellow-700 dark:text-yellow-400">notes and receipts unreadable</span>}
                {checkpoint.backup &&
                  (backupStatus(checkpoint.backup).state === 'unconfirmed' ? (
                    <span className="inline-flex items-center gap-1 text-yellow-700 dark:text-yellow-400">
                      <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                      remote copy not confirmed (last check failed)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <Cloud className="w-3 h-3" aria-hidden="true" />
                      remote copy recorded
                    </span>
                  ))}
                {checkpoint.evidence.length > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <ClipboardCheck className="w-3 h-3" aria-hidden="true" />
                    {checkpoint.evidence.length} note{checkpoint.evidence.length === 1 ? '' : 's'} or check{checkpoint.evidence.length === 1 ? '' : 's'}
                  </span>
                )}
                {checkpoint.recoveredAt && (
                  <span className="inline-flex items-center gap-1">
                    <FolderCheck className="w-3 h-3" aria-hidden="true" />
                    recovered copy verified
                  </span>
                )}
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
