import { GroupField, GroupNode, GroupSort } from '../models';
import { compareNames } from './sort.util';

/** Pure helpers for navigating a collection's group tree. */

/**
 * A parent's children, always alphabetical. Groups have no manual order —
 * unlike items, nothing persists a position for one — so the array order is
 * merely the order they happened to be created in, which tells the reader
 * nothing. Sorting here instead of at each call site is what keeps the sidebar
 * tree, the dashboard cards, the item form's picker and the settings list
 * agreeing on where a group sits. Ties keep array order (`sort` is stable).
 */
export function childrenOf(groups: GroupNode[], parentId: string | null): GroupNode[] {
  return groups.filter(g => g.parentId === parentId).sort((a, b) => compareNames(a.name, b.name));
}

export function groupById(groups: GroupNode[], id: string | null): GroupNode | undefined {
  return groups.find(g => g.id === id);
}

/** The given group id plus every descendant id. */
export function subtreeIds(groups: GroupNode[], id: string): string[] {
  const out = [id];
  for (const child of groups.filter(g => g.parentId === id)) {
    out.push(...subtreeIds(groups, child.id));
  }
  return out;
}

/** Root → …
 → group path for a group id. Unknown ids yield an empty path. */
export function pathOf(groups: GroupNode[], id: string | null): GroupNode[] {
  const path: GroupNode[] = [];
  let node = groupById(groups, id);
  let guard = 0;
  while (node && guard++ < 20) {
    path.unshift(node);
    node = node.parentId ? groupById(groups, node.parentId) : undefined;
  }
  return path;
}

/**
 * Custom fields a group inherits from its ancestors plus its own. Redeclaring
 * a name deeper in the tree overrides the ancestor's type but keeps the
 * ancestor's position, so the field order a user sees stays stable as they
 * drill down.
 */
export function fieldsFor(groups: GroupNode[], id: string | null): GroupField[] {
  const byName = new Map<string, GroupField>();
  for (const group of pathOf(groups, id)) {
    for (const field of group.fields) {
      byName.set(field.name, field);
    }
  }
  return [...byName.values()];
}

/**
 * The ordering a group uses: its own if set, otherwise the nearest ancestor
 * that defines one. Null when nothing along the path configures ordering.
 */
export function sortFor(groups: GroupNode[], id: string | null): GroupSort | null {
  const path = pathOf(groups, id);
  for (let i = path.length - 1; i >= 0; i--) {
    if (path[i].sort) return path[i].sort;
  }
  return null;
}

/** Depth-first flattening of the tree, with the nesting depth of each node. */
export function flattenTree(groups: GroupNode[]): { node: GroupNode; depth: number }[] {
  const out: { node: GroupNode; depth: number }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const node of childrenOf(groups, parentId)) {
      out.push({ node, depth });
      walk(node.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export interface TreeRow {
  node: GroupNode;
  depth: number;
  hasChildren: boolean;
}

/**
 * The rows a collapsible tree actually shows: depth-first, descending only into
 * expanded nodes. Rendering these as one flat list with `aria-level` is the
 * legal ARIA tree pattern and avoids recursive components, which are painful
 * under OnPush with signal inputs.
 *
 * Unlike `flattenTree` this guards against a cycle: `parentId` carries no
 * foreign key, so a node pointing at its own descendant is representable, and
 * an unguarded walk would hang the render rather than fail.
 */
export function visibleTree(groups: GroupNode[], expanded: ReadonlySet<string>): TreeRow[] {
  const out: TreeRow[] = [];
  const seen = new Set<string>();
  const walk = (parentId: string | null, depth: number) => {
    for (const node of childrenOf(groups, parentId)) {
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      const hasChildren = childrenOf(groups, node.id).length > 0;
      out.push({ node, depth, hasChildren });
      if (hasChildren && expanded.has(node.id)) walk(node.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}
