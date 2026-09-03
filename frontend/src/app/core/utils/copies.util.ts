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

/**
 * A copy's estimate, falling back to the item's per-unit reference value and,
 * when nothing was estimated at all, to what that copy actually cost.
 *
 * Keeping a market estimate current across a whole collection is work nobody
 * does, so most items carry `value: 0` — "not estimated", the model has no
 * other way to say it. Reading that as "worth nothing" was the wrong default in
 * both directions: it emptied the collection total, and it made the dashboard's
 * value-vs-paid trend report −100% for every un-estimated item. The price paid
 * is the one figure such an item always has, and it is a defensible floor: it
 * is what the thing was worth to someone on the day it changed hands.
 *
 * The fallback lives here, and only here, so the card, the table, the item
 * page, the group totals and ordering by value can never disagree about what
 * an item is worth. Whether the number on screen is an estimate or a price is
 * never hidden, though — see {@link valueIsPaid}.
 */
export function copyValue(item: Item, copy: ItemCopy): number {
  return copy.value ?? (item.value || copy.price);
}

/** Whether a copy's figure is what was paid rather than an estimate. */
export function copyValueIsPaid(item: Item, copy: ItemCopy): boolean {
  return copy.value === null && !item.value;
}

/**
 * The per-unit figure to show for an item: its declared estimate, or the
 * average of what its copies are worth once the fallback applies. 0 means
 * there is genuinely nothing to show — a wantlist item nobody has priced.
 *
 * Averaging rather than picking one copy keeps the arithmetic honest: the unit
 * figure times the number of copies is exactly {@link ownedValue}.
 */
export function unitValue(item: Item): number {
  if (item.value) return item.value;
  if (!item.copies.length) return 0;
  return ownedValue(item) / item.copies.length;
}

/**
 * Whether an item's displayed value leans on prices paid. True as soon as one
 * copy does: a figure that is part estimate, part receipt is still not an
 * estimate, and overstating its provenance is the failure that matters.
 */
export function valueIsPaid(item: Item): boolean {
  return !item.value && item.copies.some(copy => copy.value === null);
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
    custom: [],
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
