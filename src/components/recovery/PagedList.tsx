import { useState } from 'react';
import type { ReactNode } from 'react';
import { secondaryButton } from './format';

interface PagedListProps<T> {
  items: readonly T[];
  step?: number;
  itemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  className?: string;
}

// Projects can list thousands of files; render a page at a time.
export function PagedList<T>({ items, step = 200, itemKey, renderItem, className }: PagedListProps<T>) {
  const [limit, setLimit] = useState(step);
  const shown = items.slice(0, limit);
  return (
    <>
      <ul className={className}>
        {shown.map((item) => (
          <li key={itemKey(item)}>{renderItem(item)}</li>
        ))}
      </ul>
      {items.length > shown.length && (
        <div className="flex items-center gap-3 pt-2 text-xs text-gray-500 dark:text-gray-400">
          <span>
            Showing {shown.length} of {items.length}
          </span>
          <button type="button" className={secondaryButton} onClick={() => setLimit(limit + step)}>
            Show {Math.min(step, items.length - shown.length)} more
          </button>
        </div>
      )}
    </>
  );
}
