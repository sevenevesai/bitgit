import { useId, useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import type { Coverage } from '../../types/recovery';
import { formatBytes, inputClass, safeText, secondaryButton } from './format';
import { PagedList } from './PagedList';
import { Notice } from './Notice';

// Save mode: every eligible file is checked; unchecked paths are sent as excludedPaths.
export interface CoverageSelection {
  excluded: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
  // Wording for callers that are not saving one version (automatic-save exclusions).
  labels?: { heading: string; help: string };
}

interface CoverageViewProps {
  coverage: Coverage;
  selection?: CoverageSelection;
}

export function CoverageView({ coverage, selection }: CoverageViewProps) {
  const filterId = useId();
  const [filter, setFilter] = useState('');

  const included = coverage.included;
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return needle ? included.filter((file) => file.path.toLowerCase().includes(needle)) : included;
  }, [included, filter]);

  const excludedByChoice = selection?.excluded;
  const selectedFiles = excludedByChoice ? included.filter((file) => !excludedByChoice.has(file.path)) : included;
  const selectedBytes = selectedFiles.reduce((sum, file) => sum + file.sizeBytes, 0);

  const toggle = (path: string) => {
    if (!selection) return;
    const next = new Set(selection.excluded);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    selection.onChange(next);
  };

  const setVisible = (include: boolean) => {
    if (!selection) return;
    const next = new Set(selection.excluded);
    for (const file of visible) {
      if (include) next.delete(file.path);
      else next.add(file.path);
    }
    selection.onChange(next);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-700 dark:text-gray-300">
        {selection ? (
          <>
            <strong>{selectedFiles.length}</strong> of {included.length} eligible files selected ({formatBytes(selectedBytes)} of{' '}
            {formatBytes(coverage.totalBytes)})
          </>
        ) : (
          <>
            <strong>{included.length}</strong> files, {formatBytes(coverage.totalBytes)} total
          </>
        )}
        {coverage.excluded.length > 0 && <>; {coverage.excluded.length} not included</>}
      </p>

      {coverage.limits.length > 0 && (
        <Notice tone="info" title="Coverage limits">
          <ul className="list-disc pl-4 space-y-0.5">
            {coverage.limits.map((limit, index) => (
              <li key={`${index}-${limit}`}>{safeText(limit)}</li>
            ))}
          </ul>
        </Notice>
      )}

      {coverage.warnings.length > 0 && (
        <Notice tone="warning" title="Warnings">
          <ul className="list-disc pl-4 space-y-0.5">
            {coverage.warnings.map((warning, index) => (
              <li key={`${index}-${warning}`}>{safeText(warning)}</li>
            ))}
          </ul>
        </Notice>
      )}

      {coverage.excluded.length > 0 && (
        <details open={coverage.excluded.length <= 12} className="border border-gray-200 dark:border-gray-700 rounded-lg">
          <summary className="px-3 py-2 text-sm font-medium cursor-pointer text-gray-800 dark:text-gray-200">
            Not included ({coverage.excluded.length})
          </summary>
          <div className="px-3 pb-3 max-h-56 overflow-y-auto">
            <PagedList
              items={coverage.excluded}
              step={100}
              itemKey={(file) => file.path}
              className="divide-y divide-gray-100 dark:divide-gray-700"
              renderItem={(file) => (
                <div className="py-1.5 text-xs">
                  <div className="font-mono break-all text-gray-800 dark:text-gray-200">{safeText(file.path)}</div>
                  <div className="text-gray-500 dark:text-gray-400">{safeText(file.reason)}</div>
                </div>
              )}
            />
          </div>
        </details>
      )}

      <details open={Boolean(selection)} className="border border-gray-200 dark:border-gray-700 rounded-lg">
        <summary className="px-3 py-2 text-sm font-medium cursor-pointer text-gray-800 dark:text-gray-200">
          {selection ? (selection.labels?.heading ?? 'Choose files to save') : 'Included files'} ({included.length})
        </summary>
        <div className="px-3 pb-3 space-y-2">
          {included.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No files were eligible.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor={filterId} className="sr-only">
                  Filter files
                </label>
                <input
                  id={filterId}
                  type="search"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder="Filter files by path"
                  className={`${inputClass} max-w-xs`}
                />
                {selection && (
                  <>
                    <button type="button" className={secondaryButton} disabled={selection.disabled} onClick={() => setVisible(true)}>
                      Include {filter.trim() ? 'matching' : 'all'}
                    </button>
                    <button type="button" className={secondaryButton} disabled={selection.disabled} onClick={() => setVisible(false)}>
                      Exclude {filter.trim() ? 'matching' : 'all'}
                    </button>
                  </>
                )}
              </div>
              {selection && (
                <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                  <Info className="w-3 h-3" aria-hidden="true" />
                  {selection.labels?.help ?? 'Unchecked files are left out of this saved version.'}
                </p>
              )}
              <div className="max-h-64 overflow-y-auto">
                <PagedList
                  items={visible}
                  itemKey={(file) => file.path}
                  className="divide-y divide-gray-100 dark:divide-gray-700"
                  renderItem={(file) => (
                    <div className="flex items-center gap-2 py-1 text-xs">
                      {selection ? (
                        <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!selection.excluded.has(file.path)}
                            disabled={selection.disabled}
                            onChange={() => toggle(file.path)}
                            className="w-4 h-4 text-teal-600 rounded focus:ring-2 focus:ring-teal-500"
                          />
                          <span className="font-mono break-all text-gray-800 dark:text-gray-200">{safeText(file.path)}</span>
                        </label>
                      ) : (
                        <span className="font-mono break-all min-w-0 flex-1 text-gray-800 dark:text-gray-200">{safeText(file.path)}</span>
                      )}
                      <span className="shrink-0 text-gray-500 dark:text-gray-400">{formatBytes(file.sizeBytes)}</span>
                    </div>
                  )}
                />
                {visible.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No files match that filter.</p>}
              </div>
            </>
          )}
        </div>
      </details>
    </div>
  );
}
