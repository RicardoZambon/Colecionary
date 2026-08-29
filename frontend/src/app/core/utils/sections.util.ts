import { Item, Section } from '../models';

/**
 * Pure helpers for the dividers inside a group's item list.
 *
 * The bargain that keeps sections cheap is that **a section orders, it does not
 * scope**. Nothing about navigation learns the concept: `scopeItems`,
 * `subtreeIds`, the breadcrumb and the group tree are untouched. A section is a
 * primary sort key (see `sortItems`) plus a way to cut the resulting flat list
 * into runs for rendering — so the grid and an open item's next/previous arrows
 * still walk the very same list, in the very same order, by construction.
 */

/**
 * The bucket for items with no section, or one that does not apply. Rendered
 * last, always. `~` is outside the id charset the backend accepts, so it can
 * never collide with a real section — same trick as {@link UNGROUPED_ID}.
 */
export const UNSECTIONED_ID = '~nosection';

/** Ranks the unsectioned bucket after every declared section. */
const UNSECTIONED_RANK = Number.MAX_SAFE_INTEGER;

/**
 * A group's sections, in the order they were arranged.
 *
 * Array order, never alphabetical: unlike `childrenOf`, the position of a
 * divider is an editorial decision the user made, and re-sorting it by name
 * would be the whole reason sub-groups were the wrong tool here.
 */
export function sectionsOf(sections: Section[], groupId: string | null): Section[] {
  if (!groupId) return [];
  return sections.filter(section => section.groupId === groupId);
}

export function sectionById(sections: Section[], id: string | null): Section | undefined {
  if (!id) return undefined;
  return sections.find(section => section.id === id);
}

/**
 * Section id → position, for the sections that apply to the group on screen.
 *
 * Ownership resolution falls out of this for free: the map only holds the open
 * group's sections, so an item pointing at another group's section — or at one
 * deleted since — simply misses and ranks as unsectioned. That is deliberate.
 * Groups, sections and items all arrive in one document PUT, so a reference
 * that dangles mid-edit is legal and has to degrade, not throw.
 */
export function sectionRank(
  sections: Section[],
  groupId: string | null,
): ReadonlyMap<string, number> {
  return new Map(sectionsOf(sections, groupId).map((section, index) => [section.id, index]));
}

/** Where an item sits in the ordering: its section's position, or last. */
export function rankOf(rank: ReadonlyMap<string, number>, item: Item): number {
  return rank.get(item.sectionId) ?? UNSECTIONED_RANK;
}

/**
 * A remembered section id narrowed to one that applies to this group, or `''`
 * for "no section". Mirrors `resolveGroupId`: blank, the bucket sentinel and a
 * since-deleted or foreign section all collapse to the same thing, and `''` is
 * how an item spells it. {@link UNSECTIONED_ID} is a key to read by, never a
 * value to store.
 */
export function resolveSectionId(
  sections: Section[],
  groupId: string,
  id: string | null | undefined,
): string {
  if (!id || id === UNSECTIONED_ID) return '';
  return sectionsOf(sections, groupId).find(section => section.id === id)?.id ?? '';
}

/** One run of the visible list, under the divider that names it. */
export interface SectionChunk {
  /** The section's id, or {@link UNSECTIONED_ID}. */
  id: string;
  /** Null for the trailing bucket, and for a group that declares no sections. */
  section: Section | null;
  entries: SectionEntry[];
}

/**
 * An item together with **its index in the flat visible list** — not in the
 * chunk. Reordering, the keyboard move buttons and "is this the last row?" all
 * work in list coordinates, so chunking must not renumber anything.
 */
export interface SectionEntry {
  item: Item;
  index: number;
}

/**
 * The already-ordered list, cut into runs.
 *
 * Only cuts — it never reorders, because `sortItems` has already put the list
 * in section order. Feeding it an unordered list would produce repeated
 * headers, which is the visible symptom of having skipped that step.
 *
 * A group with no sections yields a single chunk whose `section` is null, so
 * callers render one loop and let the header disappear on its own rather than
 * carrying two code paths.
 *
 * `keepEmpty` decides whether a section nothing landed in still gets a header.
 * Unfiltered it must — a section created a moment ago has no items yet, and an
 * invisible one cannot be filled, nor can its declared target be read. Under a
 * filter it must not, or narrowing to "wanted" answers with a page of headings
 * saying nothing matched.
 */
export function chunkBySection(
  items: Item[],
  sections: Section[],
  keepEmpty = true,
): SectionChunk[] {
  if (!sections.length) {
    return [{ id: UNSECTIONED_ID, section: null, entries: items.map(toEntry) }];
  }

  const chunks = new Map<string, SectionChunk>();
  const known = new Map(sections.map(section => [section.id, section]));

  items.forEach((item, index) => {
    const section = known.get(item.sectionId) ?? null;
    const id = section?.id ?? UNSECTIONED_ID;
    const chunk = chunks.get(id);
    if (chunk) chunk.entries.push({ item, index });
    else chunks.set(id, { id, section, entries: [{ item, index }] });
  });

  // Declared order first, the leftovers last. Insertion order already matches,
  // since the list arrives sorted — this only pins it against a caller that
  // forgot.
  const out = sections
    .map(section => chunks.get(section.id) ?? { id: section.id, section, entries: [] })
    .filter(chunk => keepEmpty || chunk.entries.length > 0);
  const unsectioned = chunks.get(UNSECTIONED_ID);
  if (unsectioned) out.push(unsectioned);
  return out;
}

function toEntry(item: Item, index: number): SectionEntry {
  return { item, index };
}
