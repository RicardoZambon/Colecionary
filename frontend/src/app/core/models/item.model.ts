export type Condition = 'Mint' | 'Good' | 'Fair';

/** Best first — drives the filter chips and `bestCondition`. */
export const CONDITIONS: readonly Condition[] = ['Mint', 'Good', 'Fair'];

export type CopyStatus = 'Keep' | 'ForTrade' | 'ForSale';

export const COPY_STATUSES: readonly CopyStatus[] = ['Keep', 'ForTrade', 'ForSale'];

export interface CustomFieldValue {
  key: string;
  value: string;
}

/** One physical copy of an item. */
export interface ItemCopy {
  /** Client-generated and stable, so edits target the right copy. */
  id: string;
  condition: Condition;
  /** What was actually paid for this copy, in USD. */
  price: number;
  /** This copy's own estimate; null falls back to the item's `value`. */
  value: number | null;
  /** ISO date, 'YYYY-MM-DD'. */
  acquiredOn: string | null;
  status: CopyStatus;
  notes: string;
  /**
   * Values for the fields declared with scope `copy`, keyed by field name
   * exactly as an item's own `custom` is.
   *
   * This is what tells two otherwise identical copies apart — a slab number, a
   * signature, a shelf. The item-level list structurally cannot: it holds one
   * value where the collector has several, so the second copy's number could
   * only ever overwrite the first's.
   */
  custom: CustomFieldValue[];
}

export interface Item {
  id: string;
  name: string;
  description: string;
  year: number;
  /** Per-unit reference estimate, in USD. A copy's own `value` overrides it. */
  value: number;
  groupId: string;
  /**
   * The divider this item sits under inside its group, or `''` for none.
   * Only honoured when the section belongs to `groupId`; a mismatch reads as
   * "no section" rather than being an error, exactly like a dangling `groupId`.
   */
  sectionId: string;
  tags: string[];
  img: string;
  custom: CustomFieldValue[];
  /**
   * Physical copies owned. Ownership is derived, not stored: an item with at
   * least one copy is owned, one with none is on the wantlist.
   */
  copies: ItemCopy[];
  /** Uploaded photo ids, ordered — the first one is the cover. */
  photoIds: string[];
  /** Server-controlled creation timestamp (ISO). */
  createdAt?: string;
}
