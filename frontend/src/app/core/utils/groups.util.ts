import { GroupNode } from '../models';

/** Pure helpers for navigating a collection's group tree. */

export function childrenOf(groups: GroupNode[], parentId: string | null): GroupNode[] {
  return groups.filter(g => g.parentId === parentId);
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

/** Custom field names a group inherits from its ancestors plus its own. */
export function fieldsFor(groups: GroupNode[], id: string | null): string[] {
  return pathOf(groups, id).reduce<string[]>((acc, g) => acc.concat(g.fields), []);
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
