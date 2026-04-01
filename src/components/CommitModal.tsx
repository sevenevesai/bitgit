import { useState, useRef, useEffect } from 'react';
import {
  X,
  GitCommit,
  FileText,
  FilePlus,
  FileX,
  FileEdit,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

interface CommitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCommit: (message: string, description?: string) => void;
  changedFiles: string[];
  projectName: string;
  isLoading?: boolean;
}

export function CommitModal({
  isOpen,
  onClose,
  onCommit,
  changedFiles,
  projectName,
  isLoading = false,
}: CommitModalProps) {
  const [message, setMessage] = useState('');
  const [description, setDescription] = useState('');
  const [showFiles, setShowFiles] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  // Generate default commit message
  const generateDefaultMessage = () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const timeStr = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `Update ${dateStr} ${timeStr}`;
  };

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Reset and focus when modal opens
  useEffect(() => {
    if (isOpen) {
      const defaultMsg = generateDefaultMessage();
      setMessage(defaultMsg);
      setDescription('');
      // Focus and select the input after a short delay
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    }
  }, [isOpen]);

  // Handle keyboard events
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && message.trim()) {
      e.preventDefault();
      handleCommit();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const handleCommit = () => {
    if (message.trim()) {
      onCommit(message.trim(), description.trim() || undefined);
    }
  };

  // Categorize files by type
  const categorizeFiles = () => {
    const added: string[] = [];
    const modified: string[] = [];
    const deleted: string[] = [];
    const other: string[] = [];

    changedFiles.forEach((file) => {
      // Simple heuristic based on common git status prefixes
      // In reality, we'd get this from git status
      if (file.startsWith('A ') || file.includes('(new)')) {
        added.push(file.replace(/^A /, '').replace(' (new)', ''));
      } else if (file.startsWith('D ') || file.includes('(deleted)')) {
        deleted.push(file.replace(/^D /, '').replace(' (deleted)', ''));
      } else if (file.startsWith('M ') || file.startsWith('?? ')) {
        modified.push(file.replace(/^[M?]+ /, ''));
      } else {
        other.push(file);
      }
    });

    // If no categorization, treat all as modified
    if (added.length === 0 && modified.length === 0 && deleted.length === 0) {
      return { added: [], modified: changedFiles, deleted: [] };
    }

    return { added, modified: [...modified, ...other], deleted };
  };

  const { added, modified, deleted } = categorizeFiles();

  const getFileIcon = (type: 'added' | 'modified' | 'deleted') => {
    switch (type) {
      case 'added':
        return <FilePlus className="w-4 h-4 text-green-500" />;
      case 'deleted':
        return <FileX className="w-4 h-4 text-red-500" />;
      default:
        return <FileEdit className="w-4 h-4 text-yellow-500" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onKeyDown={handleKeyDown}
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex items-center gap-3">
            <GitCommit className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Commit Changes
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {projectName}
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
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4">
          {/* Commit Message */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Commit message
            </label>
            <input
              ref={inputRef}
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe your changes..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                       bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                       focus:ring-2 focus:ring-teal-500 focus:border-teal-500
                       placeholder-gray-400 dark:placeholder-gray-500"
              disabled={isLoading}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Press Enter to commit, or start typing to customize
            </p>
          </div>

          {/* Description (optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a longer description if needed..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                       bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                       focus:ring-2 focus:ring-teal-500 focus:border-teal-500
                       placeholder-gray-400 dark:placeholder-gray-500 resize-none"
              disabled={isLoading}
            />
          </div>

          {/* Changed Files */}
          {changedFiles.length > 0 && (
            <div>
              <button
                onClick={() => setShowFiles(!showFiles)}
                className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 hover:text-gray-900 dark:hover:text-white"
              >
                {showFiles ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                <FileText className="w-4 h-4" />
                Changes to commit ({changedFiles.length} file{changedFiles.length !== 1 ? 's' : ''})
              </button>

              {showFiles && (
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3 max-h-48 overflow-y-auto overscroll-contain">
                  <div className="space-y-1 font-mono text-sm">
                    {added.length > 0 && added.map((file, i) => (
                      <div key={`add-${i}`} className="flex items-center gap-2 text-green-600 dark:text-green-400">
                        {getFileIcon('added')}
                        <span className="truncate">{file}</span>
                      </div>
                    ))}
                    {modified.length > 0 && modified.map((file, i) => (
                      <div key={`mod-${i}`} className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                        {getFileIcon('modified')}
                        <span className="truncate">{file}</span>
                      </div>
                    ))}
                    {deleted.length > 0 && deleted.map((file, i) => (
                      <div key={`del-${i}`} className="flex items-center gap-2 text-red-600 dark:text-red-400">
                        {getFileIcon('deleted')}
                        <span className="truncate">{file}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700
                     border border-gray-300 dark:border-gray-600 rounded-lg
                     hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors
                     disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCommit}
            disabled={!message.trim() || isLoading}
            className="flex items-center gap-2 px-4 py-2 text-white bg-teal-600 rounded-lg
                     hover:bg-teal-700 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Committing...
              </>
            ) : (
              <>
                <GitCommit className="w-4 h-4" />
                Commit & Push
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
