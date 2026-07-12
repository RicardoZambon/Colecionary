export type Condition = 'Mint' | 'Good' | 'Fair';

export interface CustomFieldValue {
  key: string;
  value: string;
}

export interface Item {
  id: string;
  name: string;
  description: string;
  year: number;
  condition: Condition;
  /** Estimated market value, in USD. */
  value: number;
  /** What was actually paid, in USD. 0 for wanted items. */
  price: number;
  groupId: string;
  tags: string[];
  img: string;
  custom: CustomFieldValue[];
  /** false = on the wantlist, not in the vault yet. */
  owned: boolean;
}

export type ItemDraft = Omit<Item, 'id' | 'img' | 'tags'>;
