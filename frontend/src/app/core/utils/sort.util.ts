import { GroupField, GroupSort, Item, SortDirection } from '../models';
import { sortValue } from './copies.util';

/**
 * Pure ordering helpers. Every screen that lists items goes through here, so a
 * group's configured order and an ad-hoc pick from the sort menu can never
 * disagree about what "Número ↑" means.
 */

/** Built-in sort keys, in the order they appear in the sort menu. */
export const BUILTIN_SORTS = ['manual', 'added', 'name', 'value', 'year'] as const;

/** The ordering used when neither the group nor the user has picked one. */
export const DEFAULT_SORT: GroupSort = { by: 'added', direction: 'desc' };

const FIELD_PREFIX = 'field:';

/** Numeric-aware so a free-text field still orders 1 · 2 · 10 · 12A. */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * Accent- and numeric-aware A–Z comparison of two names, shared by every
 * alphabetical listing so "Álbuns" files next to "Albuns" and "Volume 2" still
 * precedes "Volume 10".
 */
export function compareNames(a: string, b: string): number {
  return collator.compare(a, b);
}

/** `field:Número` → `Número`; null for built-in keys. */
export function customFieldName(by: string): string | null {
  return by.startsWith(FIELD_PREFIX) ? by.slice(FIELD_PREFIX.length) : null;
}

/** `Número` → `field:Número`. */
export function fieldSortKey(name: string): string {
  return FIELD_PREFIX + name;
}

const BUILTIN_LABELS: Record<string, { asc: string; desc: string }> = {
  added: { asc: 'Oldest first', desc: 'Recently added' },
  name: { asc: 'Name A–Z', desc: 'Name Z–A' },
  value: { asc: 'Value low → high', desc: 'Value high → low' },
  year: { asc: 'Year old → new', desc: 'Year new → old' },
};

export function sortLabel(sort: GroupSort): string {
  if (sort.by === 'manual') return 'Manual order';
  const field = customFieldName(sort.by);
  if (field) return `${field} ${sort.direction === 'asc' ? '↑' : '↓'}`;
  return BUILTIN_LABELS[sort.by]?.[sort.direction] ?? sortLabel(DEFAULT_SORT);
}

const SORT_BY_LABELS: Record<string, string> = {
  manual: 'Manual — drag to arrange',
  added: 'Date added',
  name: 'Name',
  value: 'Value',
  year: 'Year',
};

/** What a bare `by` key is called, without a direction. */
export function sortByLabel(by: string): string {
  return customFieldName(by) ?? SORT_BY_LABELS[by] ?? by;
}

/**
 * Choices for an "order by" picker — built-in keys plus one entry per custom
 * field. Shaped like `SelectOption` without core having to know about
 * `shared/ui`.
 */
export function sortByOptions(fields: GroupField[]): { value: string; label: string }[] {
  return [
    ...BUILTIN_SORTS.map(by => ({ value: by, label: sortByLabel(by) })),
    ...fields.map(field => ({ value: fieldSortKey(field.name), label: field.name })),
  ];
}

export interface SortChoice extends GroupSort {
  label: string;
}

/** Every ordering offered for a group: built-ins plus a pair per custom field. */
export function sortChoices(fields: GroupField[]): SortChoice[] {
  const choice = (by: string, direction: SortDirection): SortChoice => ({
    by,
    direction,
    label: sortLabel({ by, direction }),
  });
  return [
    choice('manual', 'asc'),
    choice('added', 'desc'),
    choice('name', 'asc'),
    choice('value', 'desc'),
    choice('value', 'asc'),
    choice('year', 'asc'),
    choice('year', 'desc'),
    ...fields.flatMap(field => [
      choice(fieldSortKey(field.name), 'asc'),
      choice(fieldSortKey(field.name), 'desc'),
    ]),
  ];
}

/** An item's raw value for a custom field, or '' when it has none. */
export function fieldValue(item: Item, name: string): string {
  return item.custom.find(c => c.key === name)?.value.trim() ?? '';
}

/** null means "no value for this key" — those always sink to the bottom. */
type SortKeyValue = string | number | null;

function keyOf(item: Item, sort: GroupSort, fields: GroupField[]): SortKeyValue {
  const fieldName = customFieldName(sort.by);
  if (fieldName !== null) {
    const raw = fieldValue(item, fieldName);
    if (!raw) return null;
    const type = fields.find(f => f.name === fieldName)?.type ?? 'text';
    if (type === 'number') {
      // A decimal comma is what a Brazilian keyboard produces; treat it as one.
      const parsed = parseFloat(raw.replace(',', '.'));
      return Number.isFinite(parsed) ? parsed : null;
    }
    // ISO 'YYYY-MM-DD' dates compare correctly as plain strings, and free text
    // gets the numeric-aware collator.
    return raw;
  }

  switch (sort.by) {
    case 'name':
      return item.name;
    case 'value':
      return sortValue(item);
    case 'year':
      return item.year;
    case 'added': {
      const parsed = item.createdAt ? Date.parse(item.createdAt) : NaN;
      return Number.isFinite(parsed) ? parsed : null;
    }
    default:
      return null;
  }
}

function compare(a: SortKeyValue, b: SortKeyValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return collator.compare(String(a), String(b));
}

/**
 * Ordered copy of `items`. `fields` supplies the declared type for `field:`
 * sorts. Items with no value for the key always land at the end, whichever
 * direction is asked for, and ties break by name so the list never shuffles
 * between renders.
 */
export function sortItems(items: Item[], sort: GroupSort, fields: GroupField[]): Item[] {
  // Manual order *is* the array order the server round-trips.
  if (sort.by === 'manual') return [...items];

  const direction = sort.direction === 'desc' ? -1 : 1;
  return [...items].sort((a, b) => {
    const keyA = keyOf(a, sort, fields);
    const keyB = keyOf(b, sort, fields);
    if (keyA === null || keyB === null) {
      if (keyA !== null) return -1;
      if (keyB !== null) return 1;
      return a.name.localeCompare(b.name);
    }
    const result = compare(keyA, keyB);
    return result !== 0 ? result * direction : a.name.localeCompare(b.name);
  });
}

/** `items` with the entry at `from` moved to `to`. Out-of-range is a no-op. */
export function moveInList<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= items.length || to < 0 || to >= items.length) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Reorders `all` so the items named by `visibleIds` occupy the same slots they
 * already held, in the new relative order given by `newOrder`. Lets a drag
 * inside a filtered group view produce a coherent collection-wide array
 * without disturbing anything the filter hid.
 */
export function applyManualOrder(all: Item[], visibleIds: string[], newOrder: string[]): Item[] {
  const visible = new Set(visibleIds);
  const slots: number[] = [];
  all.forEach((item, index) => {
    if (visible.has(item.id)) slots.push(index);
  });

  const byId = new Map(all.map(item => [item.id, item]));
  const next = [...all];
  newOrder.forEach((id, position) => {
    const item = byId.get(id);
    if (item && position < slots.length) next[slots[position]] = item;
  });
  return next;
}
