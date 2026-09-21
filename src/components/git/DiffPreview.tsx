import type { DiffInfo, DiffScope } from '../../types';

export const SCOPE_LABEL: Record<DiffScope, string> = {
  staged: 'Staged',
  unstaged: 'Unstaged',
  untracked: 'Untracked',
};

export const SCOPE_HELP: Record<DiffScope, string> = {
  staged: 'Staged: changes already added to the next commit',
  unstaged: 'Unstaged: changes in the working folder that are not staged yet',
  untracked: 'Untracked: a new file Git has not seen before',
};

const SCOPE_STYLE: Record<DiffScope, string> = {
  staged: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  unstaged: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200',
  untracked: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
};

export function ScopeBadge({ scope, detail }: { scope: DiffScope; detail?: string | null }) {
  return (
    <span
      title={SCOPE_HELP[scope]}
      className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${SCOPE_STYLE[scope]}`}
    >
      {SCOPE_LABEL[scope]}
      {detail ? ` (${detail})` : ''}
    </span>
  );
}

// One scoped diff. A partly staged file arrives as a staged and an unstaged diff, so the scope is
// always shown; binary and cut-off previews say so instead of looking like an empty change.
export function DiffPreview({ diff }: { diff: DiffInfo }) {
  return (
    <div
      className="rounded-lg border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 overflow-hidden"
      data-testid="diff-preview"
      data-scope={diff.scope ?? 'unknown'}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-700">
        <span className="font-mono text-xs text-gray-900 dark:text-white truncate">{diff.fileName}</span>
        {diff.scope && <ScopeBadge scope={diff.scope} />}
      </div>

      {diff.binary ? (
        <p className="p-3 text-xs text-gray-600 dark:text-gray-400">
          Binary file: there is no text preview. It is published exactly as it is on disk.
        </p>
      ) : diff.changes.length === 0 ? (
        <p className="p-3 text-xs text-gray-600 dark:text-gray-400">
          No text lines to show for this part (for example an empty file, a renamed file or a
          permissions change).
        </p>
      ) : (
        <div className="p-2 font-mono text-xs max-h-60 overflow-y-auto overscroll-contain">
          {diff.changes.map((change, idx) => (
            <div
              key={idx}
              className={`px-2 py-0.5 whitespace-pre-wrap break-all ${
                change.type === 'add'
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200'
                  : change.type === 'remove'
                    ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200'
                    : 'text-gray-700 dark:text-gray-300'
              }`}
            >
              <span className="text-gray-500 mr-3 select-none">{change.line}</span>
              {change.type === 'add' ? '+ ' : change.type === 'remove' ? '- ' : '  '}
              {change.content}
            </div>
          ))}
        </div>
      )}

      {diff.truncated && (
        <p className="px-3 py-2 text-xs text-yellow-800 dark:text-yellow-200 bg-yellow-50 dark:bg-yellow-900/20 border-t border-yellow-200 dark:border-yellow-800">
          Preview cut short: only the beginning is shown. The whole file is still what gets published.
        </p>
      )}
    </div>
  );
}
