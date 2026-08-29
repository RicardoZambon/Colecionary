import { Observable } from 'rxjs';
import { Collection, Item, Member, StoreListing, TenantSettings, UserProfile } from '../models';

/**
 * A collection and the opaque version token the server will demand back before
 * it accepts a write of it.
 *
 * Beside the document rather than inside it, deliberately. `Collection` is the
 * shape an exported archive holds, and a concurrency token has no business in a
 * backup — nor in a model every page spreads and reshapes. The version belongs
 * to the *copy this app is holding*, which is why {@link VaultStore} keeps it
 * and not the object.
 */
export interface VersionedCollection {
  /** An HTTP entity-tag, quotes included. Never parsed — only echoed back. */
  version: string;
  collection: Collection;
}

/** An item, and the version its collection moved to when it was saved. */
export interface VersionedItem {
  version: string;
  item: Item;
}

/**
 * The server refused a write because the document changed after this app read
 * it. **Nothing was saved**, which is the part the user has to be told.
 *
 * Its own type rather than a message string: a page has to be able to tell
 * "somebody else got there first" — where the right answer is to keep the form
 * exactly as it is and explain — from "the network is down", where the right
 * answer is to try again. A toast cannot make that distinction and neither can
 * a caller matching on words.
 */
export class VaultConflictError extends Error {
  constructor(
    /** The collection whose version moved, so the notice can name it. */
    readonly collectionId: string,
    message: string,
  ) {
    super(message);
    this.name = 'VaultConflictError';
  }
}

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
  /**
   * Every collection, each with the version a later write of it must quote.
   *
   * This is where the app synchronises, so this is where versions come from: a
   * token fetched at any other moment would describe a document the edits being
   * saved were not derived from — a precondition that passes exactly when it
   * ought to fail.
   */
  abstract listCollections(): Observable<VersionedCollection[]>;
  abstract createCollection(input: {
    name: string;
    description: string;
  }): Observable<VersionedCollection>;
  /**
   * Replaces the whole document. `version` is the token this app last
   * synchronised with; the server refuses the write with a
   * {@link VaultConflictError} if it has moved on, and writes nothing.
   */
  abstract updateCollection(
    collection: Collection,
    version: string,
  ): Observable<VersionedCollection>;
  abstract deleteCollection(id: string): Observable<void>;
  /** Instantiates a curated Store checklist as a new (wanted-only) collection. */
  abstract importStoreListing(listingId: string): Observable<VersionedCollection>;

  // --- items ---
  /** Saves one item. Guarded by the collection's version, like a full save. */
  abstract upsertItem(
    collectionId: string,
    item: Item,
    version: string,
  ): Observable<VersionedItem>;
  /**
   * Removes one item, and answers with the version its collection moved to.
   *
   * Unguarded on purpose — "delete this item" is not derived from the rest of
   * the document — but it still moves the version, so the new one has to come
   * back or the next save would quote a token this app has already invalidated
   * itself.
   */
  abstract deleteItem(collectionId: string, itemId: string): Observable<string>;

  // --- store / tenant / profile ---
  abstract listStoreListings(): Observable<StoreListing[]>;
  abstract listTenantMembers(): Observable<Member[]>;
  abstract updateTenantMembers(members: Member[]): Observable<Member[]>;
  abstract getTenantSettings(): Observable<TenantSettings>;
  /** Owner-only on the server; a non-Owner caller gets a 403. */
  abstract updateTenantSettings(settings: TenantSettings): Observable<TenantSettings>;
  abstract getProfile(): Observable<UserProfile>;
  abstract updateProfile(profile: UserProfile): Observable<UserProfile>;
}
