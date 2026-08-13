export type GroupFieldType = 'text' | 'number' | 'date';

export const GROUP_FIELD_TYPES: readonly GroupFieldType[] = ['text', 'number', 'date'];

/**
 * A custom field declared by a group. The type drives both the input rendered
 * on the item form and how the field compares when items are ordered by it.
 */
export interface GroupField {
  name: string;
  type: GroupFieldType;
}

export type SortDirection = 'asc' | 'desc';

/**
 * How a group orders its items by default. `by` is either a built-in key
 * ('manual' | 'added' | 'name' | 'value' | 'year') or `field:<field name>`.
 */
export interface GroupSort {
  by: string;
  direction: SortDirection;
}

/**
 * A node in a collection's group tree. Groups nest arbitrarily deep and each
 * level can define custom fields that apply to every item in the group and its
 * sub-groups, plus the ordering those items default to.
 */
export interface GroupNode {
  id: string;
  name: string;
  parentId: string | null;
  fields: GroupField[];
  /** Default ordering; null inherits from the nearest ancestor that defines one. */
  sort: GroupSort | null;
  /**
   * Declared size of the complete set this group stands for — a 120-issue run,
   * a 24-card set — so progress can be measured against the series and not
   * merely against what has been catalogued. Null means no target was
   * declared and progress falls back to owned-of-catalogued.
   *
   * Required and nullable rather than optional, exactly like `sort`: the
   * collection is saved as a full-document PUT, so a field left `undefined`
   * would round-trip as a deletion and wipe every target in the collection.
   */
  target: number | null;
}
