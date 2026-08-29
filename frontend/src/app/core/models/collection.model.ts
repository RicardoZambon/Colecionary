import { GroupNode } from './group.model';
import { Item } from './item.model';
import { Member } from './member.model';
import { Section } from './section.model';
import { CurrencyCode } from '../utils/money.util';

export interface Collection {
  id: string;
  name: string;
  description: string;
  groups: GroupNode[];
  /** Item-level dividers, in display order. Each belongs to one group. */
  sections: Section[];
  items: Item[];
  /** People this collection is shared with (the tenant owner is implicit). */
  members: Member[];
  linkShare: boolean;
  /**
   * ISO 4217 override for this collection's amounts. `null` means the account
   * default decides — and null is the only way to say that, so it must survive
   * a round-trip. Read it through `currencyOf`, never directly.
   */
  currency?: CurrencyCode | null;
  bannerImageId?: string | null;
  iconImageId?: string | null;
}
