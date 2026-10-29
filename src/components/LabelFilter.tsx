import { useCallback, useRef, useState } from 'react';
import { Star, Tag } from 'lucide-react';
import type { LabelCount } from '../lib/labels';
import { sameLabel } from '../lib/labels';
import { useDismiss } from '../lib/useDismiss';

interface LabelFilterProps {
  options: LabelCount[];
  selected: string[];
  onChange: (selected: string[]) => void;
  favoritesOnly: boolean;
  onFavoritesOnlyChange: (favoritesOnly: boolean) => void;
}

// Board filter: a project shows when it has any of the ticked labels. None ticked shows everything.
// Favorites is ticked separately and narrows the result further.
export function LabelFilter({ options, selected, onChange, favoritesOnly, onFavoritesOnlyChange }: LabelFilterProps) {
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

  const active = selected.length + (favoritesOnly ? 1 : 0);
  const FilterIcon = favoritesOnly && selected.length === 0 ? Star : Tag;
  const buttonText = favoritesOnly && selected.length === 0 ? 'Favorites' : `Labels${active > 0 ? ` (${active})` : ''}`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        title="Filter by favorites and labels"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`flex h-full items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
          active > 0
            ? 'bg-teal-50 dark:bg-teal-900/30 text-teal-800 dark:text-teal-200 border-2 border-teal-500'
            : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
        }`}
      >
        <FilterIcon className={`w-4 h-4 ${FilterIcon === Star ? 'fill-yellow-400 text-yellow-500' : ''}`} aria-hidden="true" />
        {buttonText}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-60 max-h-72 overflow-auto rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg p-2">
          <label className="flex items-center gap-2 px-2 py-1 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer">
            <input type="checkbox" checked={favoritesOnly} onChange={() => onFavoritesOnlyChange(!favoritesOnly)} />
            <Star className="w-4 h-4 fill-yellow-400 text-yellow-500" aria-hidden="true" />
            <span className="flex-1">Favorites</span>
          </label>
          <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
          {options.length === 0 ? (
            <p className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400">
              No labels yet. Add one with + Label on a project card.
            </p>
          ) : (
            options.map((option) => (
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
            ))
          )}
          {active > 0 && (
            <button
              type="button"
              onClick={() => {
                onChange([]);
                onFavoritesOnlyChange(false);
              }}
              className="mt-1 w-full border-t border-gray-100 dark:border-gray-700 px-2 pt-2 text-left text-xs text-teal-700 dark:text-teal-300 hover:underline"
            >
              Clear this filter
            </button>
          )}
        </div>
      )}
    </div>
  );
}
