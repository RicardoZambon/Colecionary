export interface StoreListingItem {
  id: string;
  name: string;
  year: number;
  value: number;
  group: string;
  img: string;
}

/** A curated checklist published in the Collection Store. */
export interface StoreListing {
  id: string;
  name: string;
  publisher: string;
  description: string;
  groups: string[];
  items: StoreListingItem[];
}
