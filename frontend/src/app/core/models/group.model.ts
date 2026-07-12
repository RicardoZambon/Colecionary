/**
 * A node in a collection's group tree. Groups nest arbitrarily deep and each
 * level can define custom field names that apply to every item in the group
 * and its sub-groups.
 */
export interface GroupNode {
  id: string;
  name: string;
  parentId: string | null;
  fields: string[];
}
