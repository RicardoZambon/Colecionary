import { GroupField, GroupNode } from './group.model';
import { Item } from './item.model';
import { Member } from './member.model';
import { Section } from './section.model';
import { CurrencyCode } from '../utils/money.util';

export interface Collection {
  id: string;
  name: string;
  description: string;
  /**
   * Fields every item in the collection has, whatever group it sits in — and
   * whatever group it is moved to later.
   *
   * Groups are a taxonomy, so a field that describes the collection rather than
   * a kind of thing in it (where it is stored, who it came from) had no home:
   * it had to be redeclared in every root group, and a group created afterwards
   * silently lacked it. These merge *first* in `fieldsFor`, so a group
   * redeclaring the same name still overrides them — the same rule that already
   * lets a group override its ancestor.
   */
  fields: GroupField[];
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
