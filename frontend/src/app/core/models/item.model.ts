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
}

export interface Item {
  id: string;
  name: string;
  description: string;
  year: number;
  /** Per-unit reference estimate, in USD. A copy's own `value` overrides it. */
  value: number;
  groupId: string;
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
