import { GroupNode } from './group.model';
import { Item } from './item.model';
import { Member } from './member.model';

export interface Collection {
  id: string;
  name: string;
  description: string;
  groups: GroupNode[];
  items: Item[];
  /** People this collection is shared with (the tenant owner is implicit). */
  members: Member[];
  linkShare: boolean;
}
