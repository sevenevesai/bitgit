import { useCallback, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, X } from 'lucide-react';
import type { Project } from '../types';
import { useAppStore } from '../stores/useAppStore';
import { MAX_LABELS, labelColorClass, sameLabel } from '../lib/labels';
import { useDismiss } from '../lib/useDismiss';

interface ProjectLabelsProps {
  project: Project;
  // Every label used on any project, offered as suggestions.
  catalog: string[];
}

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// A project's label chips with remove buttons, and a popover to add an existing or new label.
export function ProjectLabels({ project, catalog }: ProjectLabelsProps) {
  const setProjectLabels = useAppStore((state) => state.setProjectLabels);
  const labels = project.labels ?? [];
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const atLimit = labels.length >= MAX_LABELS;

  const close = useCallback(() => {
    setOpen(false);
    setDraft('');
    setError(null);
  }, []);
  useDismiss(boxRef, open, close);

  // The backend validates and normalizes; a rejected list leaves the stored labels untouched.
  // From the popover the reason shows inline; from a chip's remove button it is a toast.
  const save = async (next: string[], fromPopover = true) => {
    setSaving(true);
    setError(null);
    try {
      await setProjectLabels(project.id, next);
      close();
    } catch (err) {
      if (fromPopover) setError(errorText(err));
      else toast.error(`Failed to save labels: ${errorText(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const query = draft.trim().replace(/\s+/g, ' ');
  const suggestions = catalog.filter(
    (name) =>
      !labels.some((label) => sameLabel(label, name)) &&
      (!query || name.toLowerCase().includes(query.toLowerCase()))
  );
  const canCreate =
    Boolean(query) && !catalog.some((name) => sameLabel(name, query)) && !labels.some((label) => sameLabel(label, query));

  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-4" data-testid="project-labels">
      {labels.map((label) => (
        <span
          key={label.toLowerCase()}
          className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${labelColorClass(label)}`}
        >
          <span className="truncate">{label}</span>
          <button
            type="button"
            aria-label={`Remove label ${label}`}
            disabled={saving}
            onClick={() => void save(labels.filter((item) => !sameLabel(item, label)), false)}
            className="rounded-full opacity-60 hover:opacity-100 disabled:opacity-30"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}

      <div className="relative" ref={boxRef}>
        <button
          type="button"
          disabled={atLimit || saving}
          aria-expanded={open}
          title={atLimit ? `A project can have at most ${MAX_LABELS} labels` : 'Add a label'}
          onClick={() => (open ? close() : setOpen(true))}
          className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-gray-300 dark:border-gray-600 px-2 py-0.5 text-xs text-gray-500 dark:text-gray-400 hover:border-teal-500 hover:text-teal-700 dark:hover:text-teal-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-3 h-3" aria-hidden="true" />
          Label
        </button>
        {open && (
          <div className="absolute left-0 z-30 mt-1 w-60 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg p-2">
            <input
              autoFocus
              value={draft}
              maxLength={64}
              onChange={(event) => {
                setDraft(event.target.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && query) {
                  event.preventDefault();
                  const existing = catalog.find((name) => sameLabel(name, query));
                  void save([...labels, existing ?? query]);
                }
              }}
              placeholder="Find or create a label"
              aria-label="Label name"
              className="w-full px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
            {error && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
                {error}
              </p>
            )}
            <div className="mt-1 max-h-40 overflow-auto">
              {suggestions.map((name) => (
                <button
                  key={name.toLowerCase()}
                  type="button"
                  disabled={saving}
                  onClick={() => void save([...labels, name])}
                  className="block w-full text-left px-2 py-1 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded truncate"
                >
                  {name}
                </button>
              ))}
              {canCreate && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void save([...labels, query])}
                  className="block w-full text-left px-2 py-1 text-sm text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-gray-700 rounded truncate"
                >
                  Create “{query}”
                </button>
              )}
              {!canCreate && suggestions.length === 0 && (
                <p className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400">Type a name to create a label.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
