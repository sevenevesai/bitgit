import { useCallback, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Bookmark, Check, X } from 'lucide-react';
import type { BoardFilters, SavedView } from '../lib/boardViews';
import { MAX_SAVED_VIEWS, MAX_VIEW_NAME_CHARS, loadSavedViews, matchesView, storeSavedViews, withView } from '../lib/boardViews';
import { useDismiss } from '../lib/useDismiss';

const MENU_WIDTH_PX = 288; // w-72

interface SavedViewsProps {
  current: BoardFilters;
  onApply: (view: SavedView) => void;
}

// Named sets of board filters and sort. The button shows the view the board currently matches.
export function SavedViews({ current, onApply }: SavedViewsProps) {
  const [views, setViews] = useState<SavedView[]>(loadSavedViews);
  const [open, setOpen] = useState(false);
  const [openLeftward, setOpenLeftward] = useState(true);
  const [name, setName] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  const active = views.find((view) => matchesView(view, current));
  const trimmed = name.trim();
  const replacing = views.some((view) => view.name.toLowerCase() === trimmed.toLowerCase());
  const full = views.length >= MAX_SAVED_VIEWS && !replacing;

  const persist = (next: SavedView[]): boolean => {
    try {
      storeSavedViews(next);
      setViews(next);
      return true;
    } catch (error) {
      toast.error(`Could not store saved views: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  };

  const save = () => {
    if (!trimmed || full) return;
    if (persist(withView(views, { ...current, labels: [...current.labels], name: trimmed }))) setName('');
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        title="Saved views: named sets of filters and sort"
        aria-expanded={open}
        onClick={(event) => {
          // The toolbar wraps on narrow windows, which can put this button at the left edge.
          setOpenLeftward(event.currentTarget.getBoundingClientRect().right > MENU_WIDTH_PX + 8);
          setOpen((value) => !value);
        }}
        aria-label={active ? `Saved view: ${active.name}` : 'Saved views'}
        className={`flex h-full max-w-[12rem] items-center gap-2 py-2 rounded-lg font-medium transition-colors ${
          active
            ? 'px-4 bg-teal-50 dark:bg-teal-900/30 text-teal-800 dark:text-teal-200 border-2 border-teal-500'
            : 'px-3 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
        }`}
      >
        <Bookmark className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
        {/* Icon only until a view is active, so the filter row fits one line at the default window size */}
        {active && <span className="truncate">{active.name}</span>}
      </button>
      {open && (
        <div className={`absolute ${openLeftward ? 'right-0' : 'left-0'} z-30 mt-1 w-72 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg p-2`}>
          {views.length === 0 ? (
            <p className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400">
              No saved views yet. Set the filters and sort, then name them below.
            </p>
          ) : (
            <ul className="max-h-60 overflow-auto">
              {views.map((view) => (
                <li key={view.name.toLowerCase()} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      onApply(view);
                      setOpen(false);
                    }}
                    className="flex flex-1 min-w-0 items-center gap-2 px-2 py-1 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded"
                  >
                    <Check className={`w-4 h-4 flex-shrink-0 ${view === active ? 'text-teal-600' : 'invisible'}`} aria-hidden="true" />
                    <span className="truncate">{view.name}</span>
                  </button>
                  <button
                    type="button"
                    title={`Delete the view "${view.name}"`}
                    onClick={() => persist(views.filter((item) => item !== view))}
                    className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="mt-2 border-t border-gray-100 dark:border-gray-700 pt-2"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={name}
                maxLength={MAX_VIEW_NAME_CHARS}
                onChange={(event) => setName(event.target.value)}
                placeholder="Name the current view"
                aria-label="View name"
                className="flex-1 min-w-0 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <button
                type="submit"
                disabled={!trimmed || full}
                className="px-3 py-1 text-sm text-white bg-teal-600 dark:bg-teal-700 rounded hover:bg-teal-700 disabled:opacity-50"
              >
                Save
              </button>
            </div>
            {full ? (
              <p className="mt-1 px-1 text-xs text-gray-500 dark:text-gray-400">
                Delete a view to save another ({MAX_SAVED_VIEWS} at most).
              </p>
            ) : replacing ? (
              <p className="mt-1 px-1 text-xs text-gray-500 dark:text-gray-400">Replaces the view with this name.</p>
            ) : null}
          </form>
        </div>
      )}
    </div>
  );
}
