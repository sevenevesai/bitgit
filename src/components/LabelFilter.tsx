import { useCallback, useRef, useState } from 'react';
import { Tag } from 'lucide-react';
import type { LabelCount } from '../lib/labels';
import { sameLabel } from '../lib/labels';
import { useDismiss } from '../lib/useDismiss';

interface LabelFilterProps {
  options: LabelCount[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

// Board filter: a project shows when it has any of the ticked labels. None ticked shows everything.
export function LabelFilter({ options, selected, onChange }: LabelFilterProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  const toggle = (name: string) => {
    onChange(
      selected.some((item) => sameLabel(item, name))
        ? selected.filter((item) => !sameLabel(item, name))
        : [...selected, name]
    );
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        title={options.length === 0 ? 'Add labels to projects to filter by them' : 'Filter by label'}
        aria-expanded={open}
        disabled={options.length === 0}
        onClick={() => setOpen((value) => !value)}
        className={`flex h-full items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          selected.length > 0
            ? 'bg-teal-50 dark:bg-teal-900/30 text-teal-800 dark:text-teal-200 border-2 border-teal-500'
            : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
        }`}
      >
        <Tag className="w-4 h-4" aria-hidden="true" />
        Labels{selected.length > 0 ? ` (${selected.length})` : ''}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-60 max-h-72 overflow-auto rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg p-2">
          {options.map((option) => (
            <label
              key={option.name.toLowerCase()}
              className="flex items-center gap-2 px-2 py-1 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.some((item) => sameLabel(item, option.name))}
                onChange={() => toggle(option.name)}
              />
              <span className="flex-1 truncate">{option.name}</span>
              <span className="text-xs text-gray-400">{option.count}</span>
            </label>
          ))}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 w-full border-t border-gray-100 dark:border-gray-700 px-2 pt-2 text-left text-xs text-teal-700 dark:text-teal-300 hover:underline"
            >
              Clear label filter
            </button>
          )}
        </div>
      )}
    </div>
  );
}
