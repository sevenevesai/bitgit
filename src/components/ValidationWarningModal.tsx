import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { invoke } from '@tauri-apps/api/tauri';
import {
  X,
  AlertTriangle,
  XCircle,
  Info,
  FileWarning,
  Plus,
  CheckCircle,
} from 'lucide-react';
import type { FileValidationIssue, PreSyncValidation } from '../types';

export type { FileValidationIssue, PreSyncValidation };

interface ValidationWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Publishes with exactly the files and action that were validated. Only offered when nothing blocks.
  onProceed: () => void;
  // Called after .gitignore was changed so the caller can re-read the files and validate again.
  onGitignoreUpdated: () => void;
  validation: PreSyncValidation;
  projectId: string;
  isBusy?: boolean;
}

const formatSize = (mb: number | undefined) => {
  if (!mb) return '';
  return mb >= 1 ? `${mb.toFixed(1)}MB` : `${(mb * 1024).toFixed(0)}KB`;
};

function IssueList({ issues, tone }: { issues: FileValidationIssue[]; tone: 'red' | 'yellow' }) {
  const box =
    tone === 'red'
      ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
      : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800';
  const path = tone === 'red' ? 'text-red-800 dark:text-red-200' : 'text-yellow-800 dark:text-yellow-200';
  const reason = tone === 'red' ? 'text-red-600 dark:text-red-400' : 'text-yellow-700 dark:text-yellow-400';
  const Icon = tone === 'red' ? XCircle : AlertTriangle;
  const iconColor = tone === 'red' ? 'text-red-500' : 'text-yellow-500';

  return (
    <ul className="space-y-2">
      {issues.map((issue, i) => (
        <li key={`${issue.filePath}-${i}`} className={`${box} border rounded-lg p-3`}>
          <div className="flex items-start gap-2">
            <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${iconColor}`} aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className={`font-mono text-sm break-all ${path}`}>{issue.filePath}</p>
              <p className={`text-sm ${reason}`}>{issue.reason}</p>
              {issue.suggestion && (
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{issue.suggestion}</p>
              )}
            </div>
            {issue.sizeMb ? (
              <span className={`text-xs font-medium ${reason}`}>{formatSize(issue.sizeMb)}</span>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ValidationWarningModal({
  isOpen,
  onClose,
  onProceed,
  onGitignoreUpdated,
  validation,
  projectId,
  isBusy = false,
}: ValidationWarningModalProps) {
  const [isAddingToGitignore, setIsAddingToGitignore] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) dialogRef.current?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  const errors = validation.issues.filter((i) => i.severity === 'error');
  const warnings = validation.issues.filter((i) => i.severity === 'warning');
  const infos = validation.issues.filter((i) => i.severity === 'info');
  const blocked = !validation.canProceed || errors.length > 0;
  const hasIssues = errors.length + warnings.length > 0;

  const handleAddToGitignore = async () => {
    if (validation.suggestedGitignore.length === 0) return;

    setIsAddingToGitignore(true);
    try {
      const added = await invoke<number>('add_gitignore_patterns', { projectId, patterns: validation.suggestedGitignore });
      if (added === 0) {
        toast('These patterns are already in .gitignore. Files Git already tracks are not affected by it.');
        return;
      }

      toast.success(`Added ${added} pattern(s) to .gitignore. Checking your files again.`);
      onGitignoreUpdated();
    } catch (error: any) {
      toast.error(`Failed to update .gitignore: ${error}`);
    } finally {
      setIsAddingToGitignore(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="validation-title"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !isBusy) onClose();
        }}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col outline-none"
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between p-4 border-b ${
            blocked
              ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
              : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <FileWarning
              className={`w-6 h-6 ${blocked ? 'text-red-600' : 'text-yellow-600'}`}
              aria-hidden="true"
            />
            <div>
              <h2
                id="validation-title"
                className={`text-lg font-semibold ${
                  blocked
                    ? 'text-red-900 dark:text-red-100'
                    : 'text-yellow-900 dark:text-yellow-100'
                }`}
              >
                {blocked ? "Can't publish yet" : hasIssues ? 'Review before publishing' : 'Ready to publish'}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {blocked
                  ? `${errors.length || 1} blocked item(s). Nothing was published.`
                  : hasIssues
                    ? `${warnings.length} warning(s). Nothing is published until you choose to continue.`
                    : 'No problems found.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isBusy}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 p-3 rounded-lg">
            <p>
              Size of the files being published:{' '}
              <span className="font-medium">{validation.totalStagedSizeMb.toFixed(1)}MB</span>
            </p>
            {blocked && (
              <p className="text-red-600 dark:text-red-400 mt-1">
                Blocked items cannot be published. Secrets, keys and files over 100MB stay blocked
                until they are removed from what you publish.
              </p>
            )}
          </div>

          {errors.length > 0 && (
            <div>
              <h3 className="font-medium text-red-700 dark:text-red-400 mb-2 flex items-center gap-2">
                <XCircle className="w-4 h-4" aria-hidden="true" />
                Blocked ({errors.length})
              </h3>
              <IssueList issues={errors} tone="red" />
            </div>
          )}

          {warnings.length > 0 && (
            <div>
              <h3 className="font-medium text-yellow-700 dark:text-yellow-400 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                Warnings ({warnings.length})
              </h3>
              <IssueList issues={warnings} tone="yellow" />
            </div>
          )}

          {infos.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer font-medium text-blue-700 dark:text-blue-400 mb-2 flex items-center gap-2">
                <Info className="w-4 h-4" aria-hidden="true" />
                Notable files ({infos.length})
              </summary>
              <div className="space-y-1 mt-2">
                {infos.map((issue, i) => (
                  <div
                    key={`${issue.filePath}-${i}`}
                    className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 pl-6"
                  >
                    <span className="font-mono truncate">{issue.filePath}</span>
                    {issue.sizeMb ? <span className="text-xs">({formatSize(issue.sizeMb)})</span> : null}
                  </div>
                ))}
              </div>
            </details>
          )}

          {validation.suggestedGitignore.length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
              <h3 className="font-medium text-gray-700 dark:text-gray-300 mb-2">
                Suggested .gitignore patterns
              </h3>
              <div className="font-mono text-sm text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700">
                {validation.suggestedGitignore.map((pattern, i) => (
                  <div key={`${pattern}-${i}`}>{pattern}</div>
                ))}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                A .gitignore entry only keeps files that are not tracked yet out of future
                commits. It does not remove a file that is already committed, and it does not
                remove a secret from your history.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex gap-2">
            {validation.suggestedGitignore.length > 0 && (
              <button
                onClick={handleAddToGitignore}
                disabled={isAddingToGitignore || isBusy}
                className="flex items-center gap-2 px-4 py-2 text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-900/20 border border-teal-300 dark:border-teal-700 rounded-lg hover:bg-teal-100 dark:hover:bg-teal-900/40 transition-colors disabled:opacity-50"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                Add to .gitignore
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={isBusy}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
            >
              {blocked ? 'Close' : 'Cancel'}
            </button>
            {!blocked && (
              <button
                onClick={onProceed}
                disabled={isBusy}
                className={`flex items-center gap-2 px-4 py-2 text-white rounded-lg transition-colors disabled:opacity-50 ${
                  hasIssues ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-teal-600 hover:bg-teal-700'
                }`}
              >
                <CheckCircle className="w-4 h-4" aria-hidden="true" />
                {hasIssues ? 'Publish despite warnings' : 'Publish'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
