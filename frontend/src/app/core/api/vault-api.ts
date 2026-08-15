import { Observable } from 'rxjs';
import { Collection, Item, Member, StoreListing, UserProfile } from '../models';

/**
 * Backend contract for the Vault app.
 *
 * The app only ever talks to this abstract class (used as the DI token).
 * `HttpVaultApi` is its only implementation, wired in `app.config.ts`. Feature
 * code sees nothing but this contract, so a second implementation would be a
 * one-line provider swap.
 */
export abstract class VaultApi {
  // --- collections ---
  abstract listCollections(): Observable<Collection[]>;
  abstract createCollection(input: { name: string; description: string }): Observable<Collection>;
  abstract updateCollection(collection: Collection): Observable<Collection>;
  abstract deleteCollection(id: string): Observable<void>;
  /** Instantiates a curated Store checklist as a new (wanted-only) collection. */
  abstract importStoreListing(listingId: string): Observable<Collection>;

  // --- items ---
  abstract upsertItem(collectionId: string, item: Item): Observable<Item>;
  abstract deleteItem(collectionId: string, itemId: string): Observable<void>;

  // --- store / tenant / profile ---
  abstract listStoreListings(): Observable<StoreListing[]>;
  abstract listTenantMembers(): Observable<Member[]>;
  abstract updateTenantMembers(members: Member[]): Observable<Member[]>;
  abstract getProfile(): Observable<UserProfile>;
  abstract updateProfile(profile: UserProfile): Observable<UserProfile>;
}
