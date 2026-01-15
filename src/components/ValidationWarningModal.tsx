import { useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import toast from 'react-hot-toast';
import {
  X,
  AlertTriangle,
  XCircle,
  Info,
  FileWarning,
  Plus,
  CheckCircle,
} from 'lucide-react';

export interface FileValidationIssue {
  filePath: string;
  severity: 'error' | 'warning' | 'info';
  reason: string;
  sizeBytes?: number;
  sizeMb?: number;
  suggestion?: string;
  gitignorePattern?: string;
}

export interface PreSyncValidation {
  canProceed: boolean;
  hasWarnings: boolean;
  totalStagedSize: number;
  totalStagedSizeMb: number;
  issues: FileValidationIssue[];
  suggestedGitignore: string[];
}

interface ValidationWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProceed: () => void;
  validation: PreSyncValidation;
  projectPath: string;
}

export function ValidationWarningModal({
  isOpen,
  onClose,
  onProceed,
  validation,
  projectPath,
}: ValidationWarningModalProps) {
  const [isAddingToGitignore, setIsAddingToGitignore] = useState(false);

  if (!isOpen) return null;

  const errors = validation.issues.filter((i) => i.severity === 'error');
  const warnings = validation.issues.filter((i) => i.severity === 'warning');
  const infos = validation.issues.filter((i) => i.severity === 'info');

  const handleAddToGitignore = async () => {
    if (validation.suggestedGitignore.length === 0) return;

    setIsAddingToGitignore(true);
    try {
      // Read existing .gitignore or create new one
      const gitignorePath = `${projectPath}\\.gitignore`;
      let existingContent = '';

      try {
        const { readTextFile } = await import('@tauri-apps/api/fs');
        existingContent = await readTextFile(gitignorePath);
      } catch {
        // File doesn't exist, that's OK
      }

      // Build new content
      const existingLines = new Set(
        existingContent.split('\n').map((l) => l.trim()).filter(Boolean)
      );
      const newPatterns = validation.suggestedGitignore.filter(
        (p) => !existingLines.has(p)
      );

      if (newPatterns.length === 0) {
        toast.success('All patterns already in .gitignore');
        setIsAddingToGitignore(false);
        return;
      }

      const newContent =
        existingContent.trim() +
        (existingContent.trim() ? '\n\n' : '') +
        '# Added by BitGit\n' +
        newPatterns.join('\n') +
        '\n';

      // Write the file
      const { writeTextFile } = await import('@tauri-apps/api/fs');
      await writeTextFile(gitignorePath, newContent);

      toast.success(`Added ${newPatterns.length} pattern(s) to .gitignore`);
      onClose();
    } catch (error: any) {
      toast.error(`Failed to update .gitignore: ${error}`);
    } finally {
      setIsAddingToGitignore(false);
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0" />;
      case 'info':
        return <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />;
      default:
        return null;
    }
  };

  const formatSize = (mb: number | undefined) => {
    if (!mb) return '';
    return mb >= 1 ? `${mb.toFixed(1)}MB` : `${(mb * 1024).toFixed(0)}KB`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div
          className={`flex items-center justify-between p-4 border-b ${
            errors.length > 0
              ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
              : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <FileWarning
              className={`w-6 h-6 ${
                errors.length > 0 ? 'text-red-600' : 'text-yellow-600'
              }`}
            />
            <div>
              <h2
                className={`text-lg font-semibold ${
                  errors.length > 0
                    ? 'text-red-900 dark:text-red-100'
                    : 'text-yellow-900 dark:text-yellow-100'
                }`}
              >
                {errors.length > 0 ? 'Sync Blocked' : 'Sync Warning'}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {errors.length > 0
                  ? `${errors.length} issue(s) will prevent push to GitHub`
                  : `${warnings.length} issue(s) detected - review before syncing`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Summary */}
          <div className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 p-3 rounded-lg">
            <p>
              Total size to sync:{' '}
              <span className="font-medium">
                {validation.totalStagedSizeMb.toFixed(1)}MB
              </span>
            </p>
            {errors.length > 0 && (
              <p className="text-red-600 mt-1">
                Files over 100MB cannot be pushed to GitHub
              </p>
            )}
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <div>
              <h3 className="font-medium text-red-700 dark:text-red-400 mb-2 flex items-center gap-2">
                <XCircle className="w-4 h-4" />
                Errors ({errors.length})
              </h3>
              <div className="space-y-2">
                {errors.map((issue, i) => (
                  <div
                    key={i}
                    className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3"
                  >
                    <div className="flex items-start gap-2">
                      {getSeverityIcon(issue.severity)}
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-sm text-red-800 dark:text-red-200 truncate">
                          {issue.filePath}
                        </p>
                        <p className="text-sm text-red-600 dark:text-red-400">
                          {issue.reason}
                        </p>
                        {issue.suggestion && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            {issue.suggestion}
                          </p>
                        )}
                      </div>
                      {issue.sizeMb && (
                        <span className="text-xs text-red-600 dark:text-red-400 font-medium">
                          {formatSize(issue.sizeMb)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div>
              <h3 className="font-medium text-yellow-700 dark:text-yellow-400 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Warnings ({warnings.length})
              </h3>
              <div className="space-y-2">
                {warnings.map((issue, i) => (
                  <div
                    key={i}
                    className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3"
                  >
                    <div className="flex items-start gap-2">
                      {getSeverityIcon(issue.severity)}
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-sm text-yellow-800 dark:text-yellow-200 truncate">
                          {issue.filePath}
                        </p>
                        <p className="text-sm text-yellow-600 dark:text-yellow-400">
                          {issue.reason}
                        </p>
                        {issue.suggestion && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            {issue.suggestion}
                          </p>
                        )}
                      </div>
                      {issue.sizeMb && (
                        <span className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">
                          {formatSize(issue.sizeMb)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Info (collapsible) */}
          {infos.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer font-medium text-blue-700 dark:text-blue-400 mb-2 flex items-center gap-2">
                <Info className="w-4 h-4" />
                Notable files ({infos.length})
              </summary>
              <div className="space-y-1 mt-2">
                {infos.map((issue, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 pl-6"
                  >
                    <span className="font-mono truncate">{issue.filePath}</span>
                    {issue.sizeMb && (
                      <span className="text-xs">({formatSize(issue.sizeMb)})</span>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Suggested .gitignore patterns */}
          {validation.suggestedGitignore.length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
              <h3 className="font-medium text-gray-700 dark:text-gray-300 mb-2">
                Suggested .gitignore patterns:
              </h3>
              <div className="font-mono text-sm text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700">
                {validation.suggestedGitignore.map((pattern, i) => (
                  <div key={i}>{pattern}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex gap-2">
            {validation.suggestedGitignore.length > 0 && (
              <button
                onClick={handleAddToGitignore}
                disabled={isAddingToGitignore}
                className="flex items-center gap-2 px-4 py-2 text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-900/20 border border-teal-300 dark:border-teal-700 rounded-lg hover:bg-teal-100 dark:hover:bg-teal-900/40 transition-colors disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                Add to .gitignore
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            {validation.canProceed && (
              <button
                onClick={onProceed}
                className="flex items-center gap-2 px-4 py-2 text-white bg-yellow-600 rounded-lg hover:bg-yellow-700 transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
                Proceed Anyway
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
