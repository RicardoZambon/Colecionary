export type GroupFieldType = 'text' | 'number' | 'date';

export const GROUP_FIELD_TYPES: readonly GroupFieldType[] = ['text', 'number', 'date'];

/**
 * What a declared field describes, and therefore which record carries its
 * value: `item` on the catalogue entry, `copy` on each physical exemplar.
 *
 * Orthogonal to *where* the field is declared. A collection and a group both
 * declare fields of either scope, which is what makes "a serial number every
 * copy in the vault has" and "a print run every issue of this series has" two
 * settings of the same thing rather than two features.
 */
export type FieldScope = 'item' | 'copy';

export const FIELD_SCOPES: readonly FieldScope[] = ['item', 'copy'];

/**
 * A custom field declaration. The type drives both the input rendered on the
 * form and how the field compares when items are ordered by it; the scope
 * decides which record the value is written to.
 *
 * The name is the field's identity — it keys the value in `custom` and is the
 * tail of a `field:<name>` sort key — so a declaration deeper in the path
 * replaces an ancestor's outright, `scope` included, rather than merging.
 *
 * `scope` is required rather than optional for the same reason `sort` and
 * `target` are: the collection saves as a full-document PUT, and a property
 * left `undefined` would round-trip through the server's own default instead of
 * through what the user chose.
 */
export interface GroupField {
  name: string;
  type: GroupFieldType;
  scope: FieldScope;
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
