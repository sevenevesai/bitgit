import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { ChevronDown, ChevronRight, RefreshCw, AlertTriangle } from 'lucide-react';
import type { DiffInfo, DiffScope, FileChangeInfo } from '../../types';
import { DiffPreview, ScopeBadge } from './DiffPreview';

type PreviewScope = DiffScope | 'all';

// Why a pending path cannot be chosen for publishing (the service rejects these anyway).
export function unselectableReason(change: FileChangeInfo): string | null {
  if (change.conflicted) return 'Has an unresolved conflict. Resolve it first.';
  if (change.path.endsWith('/')) return 'A folder or nested repository. Its files cannot be chosen from here.';
  if (change.path.startsWith('-')) return 'Names that start with a dash cannot be chosen from here.';
  return null;
}

function availableScopes(change: FileChangeInfo): DiffScope[] {
  const scopes: DiffScope[] = [];
  if (change.staged) scopes.push('staged');
  if (change.unstaged) scopes.push('unstaged');
  if (change.untracked) scopes.push('untracked');
  return scopes;
}

interface PreviewState {
  loading: boolean;
  error: string | null;
  diffs: DiffInfo[] | null;
}

interface FileChangeRowProps {
  repoPath: string;
  change: FileChangeInfo;
  checked: boolean;
  disabled: boolean;
  onToggle: (path: string) => void;
  // A failed preview of a chosen file blocks publishing, so the parent needs to know.
  onPreviewError: (path: string, error: string | null) => void;
}

export function FileChangeRow({ repoPath, change, checked, disabled, onToggle, onPreviewError }: FileChangeRowProps) {
  const scopes = availableScopes(change);
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<PreviewScope>(scopes[0] ?? 'all');
  const [previews, setPreviews] = useState<Record<string, PreviewState>>({});
  const blockedReason = unselectableReason(change);
  const partlyStaged = Boolean(change.staged && change.unstaged);
  const current = previews[scope];
  const previewError = Object.values(previews).find(preview => preview.error)?.error ?? null;

  const loadPreview = async (target: PreviewScope) => {
    setPreviews((prev) => ({ ...prev, [target]: { loading: true, error: prev[target]?.error ?? null, diffs: null } }));
    try {
      const diffs = await invoke<DiffInfo[]>('git_get_diff', {
        repoPath,
        filePath: change.path,
        scope: target,
      });
      setPreviews((prev) => ({ ...prev, [target]: { loading: false, error: null, diffs } }));
    } catch (error: any) {
      setPreviews((prev) => ({ ...prev, [target]: { loading: false, error: String(error), diffs: null } }));
    }
  };

  useEffect(() => {
    if (open && !previews[scope]) void loadPreview(scope);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scope]);

  useEffect(() => {
    onPreviewError(change.path, previewError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewError]);

  useEffect(() => () => onPreviewError(change.path, null), [change.path]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <li
      className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
      data-testid="file-row"
      data-path={change.path}
    >
      <div className="flex items-center gap-3 p-2">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled || blockedReason !== null}
          onChange={() => onToggle(change.path)}
          aria-label={`Select ${change.path}`}
          className="w-4 h-4 text-teal-600 rounded focus:ring-2 focus:ring-teal-500"
        />
        <div className="flex-1 min-w-0">
          <p className="font-mono text-sm text-gray-900 dark:text-white truncate" title={change.path}>
            {change.path}
          </p>
          <div className="flex flex-wrap gap-1 mt-1">
            {change.staged && <ScopeBadge scope="staged" detail={change.staged} />}
            {change.unstaged && <ScopeBadge scope="unstaged" detail={change.unstaged} />}
            {change.untracked && <ScopeBadge scope="untracked" />}
            {change.conflicted && (
              <span
                title="Both sides changed this file and Git could not combine them"
                className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
              >
                Conflicted
              </span>
            )}
          </div>
          {blockedReason && (
            <p className="text-xs text-red-700 dark:text-red-400 mt-1">{blockedReason}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={`${open ? 'Hide' : 'Show'} preview of ${change.path}`}
          className="flex items-center gap-1 text-sm text-teal-700 dark:text-teal-300 hover:underline"
        >
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          Preview
        </button>
      </div>

      {partlyStaged && (
        <p className="px-3 pb-2 text-xs text-gray-600 dark:text-gray-400">
          Partly staged. Choosing this file publishes its complete current version, both parts together.
        </p>
      )}

      {open && (
        <div className="border-t border-gray-200 dark:border-gray-700 p-2 space-y-2">
          {scopes.length > 1 && (
            <div className="flex gap-1" role="group" aria-label="Preview scope">
              {([...scopes, 'all'] as PreviewScope[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setScope(option)}
                  aria-pressed={scope === option}
                  className={`text-xs px-2 py-1 rounded border ${
                    scope === option
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {option === 'all' ? 'All' : option === 'staged' ? 'Staged' : option === 'unstaged' ? 'Unstaged' : 'Untracked'}
                </button>
              ))}
            </div>
          )}

          {(!current || current.loading) && (
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400" role="status">
              <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
              Loading preview...
            </div>
          )}

          {current?.error && (
            <div className="flex items-start gap-2 text-sm text-red-700 dark:text-red-400" role="alert">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <div className="flex-1">
                <p>Could not load this preview: {current.error}</p>
                <button
                  type="button"
                  onClick={() => void loadPreview(scope)}
                  className="underline text-teal-700 dark:text-teal-300"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {current?.diffs && current.diffs.length === 0 && (
            <p className="text-sm text-gray-600 dark:text-gray-400">Nothing to show for this view.</p>
          )}
          {current?.diffs?.map((diff, i) => (
            <DiffPreview key={`${diff.fileName}-${diff.scope}-${i}`} diff={diff} />
          ))}
        </div>
      )}
    </li>
  );
}
