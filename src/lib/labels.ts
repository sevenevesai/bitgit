// Label rules (length, characters, the per-project limit) are enforced by normalize_labels in
// models.rs; the UI shows its error instead of keeping a second copy of the rules.
export const MAX_LABELS = 8;

export function sameLabel(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

const LABEL_COLORS = [
  'bg-teal-50 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200',
  'bg-sky-50 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  'bg-violet-50 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
  'bg-amber-50 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  'bg-rose-50 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
  'bg-lime-50 text-lime-800 dark:bg-lime-900/40 dark:text-lime-200',
];

// A stable color per label name, whatever its case, so a label looks the same on every card.
export function labelColorClass(name: string): string {
  let hash = 0;
  for (const char of name.toLowerCase()) {
    hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  }
  return LABEL_COLORS[hash % LABEL_COLORS.length];
}

export interface LabelCount {
  name: string;
  count: number;
}

// Every label in use, first spelling wins; most used first, then by name.
export function labelCatalog(projects: { labels?: string[] }[]): LabelCount[] {
  const byKey = new Map<string, LabelCount>();
  for (const project of projects) {
    for (const label of project.labels ?? []) {
      const key = label.toLowerCase();
      const current = byKey.get(key);
      if (current) current.count += 1;
      else byKey.set(key, { name: label, count: 1 });
    }
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
