import { GroupNode, Item } from '../models';
import { isOwned, ownedValue } from './copies.util';

/**
 * Per-group aggregates: how much of a group you hold, how much is still
 * missing, and what it is worth. This file is the single place those numbers
 * are derived, the same way `sort.util.ts` owns comparison and
 * `copies.util.ts` owns ownership — no screen counts items inline.
 */

/**
 * The bucket for items whose `groupId` is empty or points at a group that no
 * longer exists. Both are legal (there is no foreign key and no NotEmpty rule
 * on the API), and without a bucket those items vanish the moment any group is
 * selected. `~` is outside the id charset the backend accepts
 * (`^[A-Za-z0-9_.:-]{1,64}$`), so this can never collide with a real group.
 */
export const UNGROUPED_ID = '~none';

/** Key under which {@link statsIndex} files the whole-collection total. */
export const COLLECTION_ID = '~all';

export interface GroupStats {
  /** Null for the synthetic root covering the whole collection. */
  groupId: string | null;
  /** Items in this subtree — owned and wantlist alike. */
  catalogued: number;
  /** Items with at least one copy. */
  owned: number;
  /** Physical copies held. Can exceed `owned`: one item, several copies. */
  copies: number;
  /** Effective declared series size, rolled up. Null when nothing declares one. */
  target: number | null;
  hasTarget: boolean;
  /** What progress is measured against: `target ?? catalogued`. */
  denominator: number;
  /** owned / denominator, 0–100. */
  pct: number;
  /** catalogued / denominator, 0–100 — the ghost band behind `pct`. */
  cataloguedPct: number;
  /** Still to acquire: `wanted + uncatalogued`. */
  missing: number;
  /** Of `missing`, the part you already have a catalogue entry for. */
  wanted: number;
  /** Of `missing`, the part not even listed yet. 0 without a target. */
  uncatalogued: number;
  /** Held beyond the declared target. 0 otherwise. */
  over: number;
  /** Estimated value of the copies actually held. */
  value: number;
  /** Direct children, so a card can offer to drill in. */
  childCount: number;
  /** Deterministic cover photos for a mosaic, owned first. */
  coverPhotoIds: string[];
}

/** A photo candidate keeps its position in `collection.items` so merges stay ordered. */
interface Candidate {
  index: number;
  photoId: string;
}

interface Acc {
  catalogued: number;
  owned: number;
  copies: number;
  value: number;
  declaredTarget: number | null;
  childTargetSum: number | null;
  childCount: number;
  ownedPhotos: Candidate[];
  wantedPhotos: Candidate[];
}

/** How many photos a mosaic cover uses. */
const COVER_MAX = 4;

function emptyAcc(): Acc {
  return {
    catalogued: 0,
    owned: 0,
    copies: 0,
    value: 0,
    declaredTarget: null,
    childTargetSum: null,
    childCount: 0,
    ownedPhotos: [],
    wantedPhotos: [],
  };
}

/** Keeps the candidate lists short: only the first few ever reach a cover. */
function mergeCandidates(a: Candidate[], b: Candidate[]): Candidate[] {
  return [...a, ...b].sort((x, y) => x.index - y.index).slice(0, COVER_MAX);
}

function addItem(acc: Acc, item: Item, index: number): void {
  const owned = isOwned(item);
  acc.catalogued++;
  acc.copies += item.copies.length;
  acc.value += ownedValue(item);
  if (owned) acc.owned++;

  const photoId = item.photoIds[0];
  if (!photoId) return;
  const list = owned ? acc.ownedPhotos : acc.wantedPhotos;
  list.push({ index, photoId });
  list.sort((x, y) => x.index - y.index);
  if (list.length > COVER_MAX) list.length = COVER_MAX;
}

function absorb(parent: Acc, child: Acc, childStats: GroupStats): void {
  parent.catalogued += child.catalogued;
  parent.owned += child.owned;
  parent.copies += child.copies;
  parent.value += child.value;
  parent.ownedPhotos = mergeCandidates(parent.ownedPhotos, child.ownedPhotos);
  parent.wantedPhotos = mergeCandidates(parent.wantedPhotos, child.wantedPhotos);
  // A parent that declares nothing still reports the sum of what its branches
  // declare; a parent that declares a target overrides it below, so a run
  // declared once at the top is never double-counted against its sub-groups.
  if (childStats.target !== null) {
    parent.childTargetSum = (parent.childTargetSum ?? 0) + childStats.target;
  }
}

function clampPct(value: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((value / denominator) * 100)));
}

function cover(acc: Acc): string[] {
  const ids = [...acc.ownedPhotos, ...acc.wantedPhotos].map(c => c.photoId);
  return [...new Set(ids)].slice(0, COVER_MAX);
}

function finalize(groupId: string | null, acc: Acc): GroupStats {
  const target = acc.declaredTarget ?? acc.childTargetSum;
  const denominator = target ?? acc.catalogued;
  const wanted = acc.catalogued - acc.owned;
  const uncatalogued = target === null ? 0 : Math.max(target - acc.catalogued, 0);

  return {
    groupId,
    catalogued: acc.catalogued,
    owned: acc.owned,
    copies: acc.copies,
    target,
    hasTarget: target !== null,
    denominator,
    pct: clampPct(acc.owned, denominator),
    cataloguedPct: clampPct(acc.catalogued, denominator),
    // Defined as the sum of its two parts rather than `denominator - owned`,
    // so it stays honest when a stale target sits below what is catalogued.
    missing: wanted + uncatalogued,
    wanted,
    uncatalogued,
    over: target === null ? 0 : Math.max(acc.owned - target, 0),
    value: acc.value,
    childCount: acc.childCount,
    coverPhotoIds: cover(acc),
  };
}

/**
 * Every group's stats in one post-order pass, plus {@link UNGROUPED_ID} when
 * any item is unfiled and {@link COLLECTION_ID} for the whole collection.
 * Computing this once and passing the map down is what keeps a tree and a board
 * of cards from each paying the O(groups × items) cost of resolving a subtree
 * per node.
 */
export function statsIndex(groups: GroupNode[], items: Item[]): ReadonlyMap<string, GroupStats> {
  const known = new Set(groups.map(g => g.id));
  const byGroup = new Map<string, { item: Item; index: number }[]>();
  const unfiled: { item: Item; index: number }[] = [];

  items.forEach((item, index) => {
    if (!known.has(item.groupId)) {
      unfiled.push({ item, index });
      return;
    }
    const bucket = byGroup.get(item.groupId);
    if (bucket) bucket.push({ item, index });
    else byGroup.set(item.groupId, [{ item, index }]);
  });

  const children = new Map<string | null, GroupNode[]>();
  for (const group of groups) {
    const siblings = children.get(group.parentId);
    if (siblings) siblings.push(group);
    else children.set(group.parentId, [group]);
  }

  const out = new Map<string, GroupStats>();
  // `parentId` has no foreign key, so a node pointing at its own descendant is
  // representable. Without this the walk would recurse until the stack blew.
  const seen = new Set<string>();

  const walk = (node: GroupNode): { acc: Acc; stats: GroupStats } => {
    const acc = emptyAcc();
    acc.declaredTarget = node.target;

    for (const { item, index } of byGroup.get(node.id) ?? []) addItem(acc, item, index);

    const kids = children.get(node.id) ?? [];
    acc.childCount = kids.length;
    for (const kid of kids) {
      if (seen.has(kid.id)) continue;
      seen.add(kid.id);
      const child = walk(kid);
      absorb(acc, child.acc, child.stats);
    }

    const stats = finalize(node.id, acc);
    out.set(node.id, stats);
    return { acc, stats };
  };

  // The collection total folds every item in — unfiled ones included — so the
  // header can never disagree with the sum of the cards below it. Only root
  // groups contribute a target: a nested one is already inside its ancestor's.
  const total = emptyAcc();
  items.forEach((item, index) => addItem(total, item, index));

  for (const root of children.get(null) ?? []) {
    if (seen.has(root.id)) continue;
    seen.add(root.id);
    const stats = walk(root).stats;
    if (stats.target !== null) {
      total.childTargetSum = (total.childTargetSum ?? 0) + stats.target;
    }
  }

  if (unfiled.length) {
    const acc = emptyAcc();
    for (const { item, index } of unfiled) addItem(acc, item, index);
    out.set(UNGROUPED_ID, finalize(UNGROUPED_ID, acc));
  }

  out.set(COLLECTION_ID, finalize(null, total));
  return out;
}

/** The whole collection, unfiled items included. */
export function rootStats(groups: GroupNode[], items: Item[]): GroupStats {
  return statsIndex(groups, items).get(COLLECTION_ID)!;
}

/**
 * The stats for whatever is on screen: null means the whole collection.
 * Unknown ids yield an empty scope rather than throwing — a `?g=` pointing at
 * a deleted group is a stale link, not a crash.
 */
export function scopeStats(
  index: ReadonlyMap<string, GroupStats>,
  groupId: string | null,
): GroupStats {
  const stats = index.get(groupId ?? COLLECTION_ID);
  return stats ?? finalize(groupId, emptyAcc());
}

/** Items with no usable group, in collection order. */
export function ungroupedItems(groups: GroupNode[], items: Item[]): Item[] {
  const known = new Set(groups.map(g => g.id));
  return items.filter(item => !known.has(item.groupId));
}
