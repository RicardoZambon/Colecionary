import { CONDITIONS, Condition, Item, ItemCopy } from '../models';

/**
 * Pure helpers over an item's copies. Ownership is derived here rather than
 * stored, so "owned" can never drift out of sync with the copies themselves.
 */

export function isOwned(item: Item): boolean {
  return item.copies.length > 0;
}

/** Best condition across the copies — Mint beats Good beats Fair. */
export function bestCondition(item: Item): Condition | null {
  return CONDITIONS.find(c => item.copies.some(copy => copy.condition === c)) ?? null;
}

/** A copy's estimate, falling back to the item's per-unit reference value. */
export function copyValue(item: Item, copy: ItemCopy): number {
  return copy.value ?? item.value;
}

/** Estimated value of what you actually hold. 0 for a wantlist item. */
export function ownedValue(item: Item): number {
  return item.copies.reduce((total, copy) => total + copyValue(item, copy), 0);
}

/** What every copy cost, added up. */
export function paidTotal(item: Item): number {
  return item.copies.reduce((total, copy) => total + copy.price, 0);
}

/** Sort key that keeps wanted items orderable by their reference value. */
export function sortValue(item: Item): number {
  return ownedValue(item) || item.value;
}

let copySeq = 0;

/** A fresh copy with sensible defaults. Ids stay unique within a tick. */
export function newCopy(): ItemCopy {
  return {
    id: `cp${Date.now().toString(36)}${(copySeq++).toString(36)}`,
    condition: 'Good',
    price: 0,
    value: null,
    acquiredOn: null,
    status: 'Keep',
    notes: '',
  };
}

/**
 * Keeps the user-visible `wanted` tag in step with the copies. "Wanted" is
 * expressed twice — as an empty copy list and as a tag — so the sync lives in
 * one place instead of being repeated in every screen that edits an item.
 */
export function syncWantedTag(item: Item): Item {
  const tags = item.copies.length
    ? item.tags.filter(t => t !== 'wanted')
    : item.tags.includes('wanted')
      ? item.tags
      : [...item.tags, 'wanted'];
  return { ...item, tags };
}
