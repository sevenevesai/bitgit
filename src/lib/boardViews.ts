import { sameLabel } from './labels';

export const SORT_ORDERS = ['favorite', 'attention', 'activity', 'name'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

// The board filters and sort a saved view restores. Display preferences are not part of a view.
export interface BoardFilters {
  readonly search: string;
  readonly status: string;
  readonly labels: readonly string[];
  readonly favoritesOnly: boolean;
  readonly showArchived: boolean;
  readonly sort: SortOrder;
}

export interface SavedView extends BoardFilters {
  readonly name: string;
}

export const MAX_SAVED_VIEWS = 20;
export const MAX_VIEW_NAME_CHARS = 40;
const STORAGE_KEY = 'bitgit.board.views';

function isSavedView(value: unknown): value is SavedView {
  if (typeof value !== 'object' || value === null) return false;
  const view = value as Record<string, unknown>;
  return (
    typeof view.name === 'string' &&
    view.name.trim().length > 0 &&
    typeof view.search === 'string' &&
    typeof view.status === 'string' &&
    Array.isArray(view.labels) &&
    view.labels.every((label) => typeof label === 'string') &&
    typeof view.favoritesOnly === 'boolean' &&
    typeof view.showArchived === 'boolean' &&
    SORT_ORDERS.includes(view.sort as SortOrder)
  );
}

// Views are kept in this WebView's local storage, so they belong to one install.
export function loadSavedViews(): SavedView[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    const views = Array.isArray(parsed) ? parsed.filter(isSavedView) : [];
    if (!Array.isArray(parsed) || views.length !== parsed.length) {
      console.warn('[SavedViews] Ignored saved views that could not be read');
    }
    return views.slice(0, MAX_SAVED_VIEWS);
  } catch (error) {
    console.warn('[SavedViews] Saved views are unreadable and were ignored', error);
    return [];
  }
}

export function storeSavedViews(views: readonly SavedView[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
}

// Saving under a name already in the list (any case) replaces that view in place.
export function withView(views: readonly SavedView[], view: SavedView): SavedView[] {
  const index = views.findIndex((item) => item.name.toLowerCase() === view.name.toLowerCase());
  if (index === -1) return [...views, view];
  return views.map((item, i) => (i === index ? view : item));
}

export function matchesView(view: BoardFilters, current: BoardFilters): boolean {
  return (
    view.search === current.search &&
    view.status === current.status &&
    view.favoritesOnly === current.favoritesOnly &&
    view.showArchived === current.showArchived &&
    view.sort === current.sort &&
    view.labels.length === current.labels.length &&
    view.labels.every((label) => current.labels.some((other) => sameLabel(label, other)))
  );
}
