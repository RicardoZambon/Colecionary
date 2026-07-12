import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';

import { VaultApi } from './vault-api';
import { PLANS, SEED_COLLECTIONS, SEED_STORE, SEED_TENANT_MEMBERS } from './seed-data';
import { Collection, Item, Member, StoreListing, UserProfile } from '../models';

const STORAGE_KEYS = {
  collections: 'vault.collections',
  tenant: 'vault.tenant-members',
  profile: 'vault.profile',
} as const;

/** Simulated network latency, ms. */
const LATENCY = 120;

const DEFAULT_PROFILE: UserProfile = {
  name: 'Marcus Keller',
  email: 'marcus@airia.com',
  initials: 'MK',
  plan: 'free',
};

/**
 * In-memory + localStorage implementation of {@link VaultApi}.
 *
 * Mimics a real backend: every call returns a delayed Observable of deep
 * copies, so consumers can't accidentally share references with the "server"
 * state. State survives reloads via localStorage.
 */
@Injectable({ providedIn: 'root' })
export class MockVaultApi extends VaultApi {
  private collections = this.readStorage<Collection[]>(STORAGE_KEYS.collections) ?? clone(SEED_COLLECTIONS);
  private tenantMembers = this.readStorage<Member[]>(STORAGE_KEYS.tenant) ?? clone(SEED_TENANT_MEMBERS);
  private profile = this.readStorage<UserProfile>(STORAGE_KEYS.profile) ?? clone(DEFAULT_PROFILE);

  // --- collections ---

  listCollections(): Observable<Collection[]> {
    return this.respond(this.collections);
  }

  createCollection(input: { name: string; description: string }): Observable<Collection> {
    const collection: Collection = {
      id: `c${Date.now()}`,
      name: input.name,
      description: input.description,
      groups: [],
      items: [],
      members: [],
      linkShare: true,
    };
    this.collections.push(collection);
    this.persist();
    return this.respond(collection);
  }

  updateCollection(collection: Collection): Observable<Collection> {
    const index = this.collections.findIndex(c => c.id === collection.id);
    if (index < 0) return this.notFound(`Collection ${collection.id}`);
    this.collections[index] = clone(collection);
    this.persist();
    return this.respond(collection);
  }

  deleteCollection(id: string): Observable<void> {
    this.collections = this.collections.filter(c => c.id !== id);
    this.persist();
    return this.respond(undefined);
  }

  importStoreListing(listingId: string): Observable<Collection> {
    const listing = SEED_STORE.find(l => l.id === listingId);
    if (!listing) return this.notFound(`Store listing ${listingId}`);
    if (this.collections.some(c => c.id === listing.id)) {
      return throwError(() => new Error('Already in your vault')).pipe(delay(LATENCY));
    }
    const collection: Collection = {
      id: listing.id,
      name: listing.name,
      description: listing.description,
      groups: listing.groups.map(name => ({ id: name, name, parentId: null, fields: [] })),
      members: [],
      linkShare: true,
      items: listing.items.map(it => ({
        id: it.id,
        name: it.name,
        year: it.year,
        value: it.value,
        groupId: it.group,
        img: it.img,
        price: 0,
        condition: 'Good',
        tags: ['wanted'],
        custom: [],
        owned: false,
        description: `From the "${listing.name}" curated checklist — not in your vault yet. Mark it as owned once you find it.`,
      })),
    };
    this.collections.push(collection);
    this.persist();
    return this.respond(collection);
  }

  // --- items ---

  upsertItem(collectionId: string, item: Item): Observable<Item> {
    const collection = this.collections.find(c => c.id === collectionId);
    if (!collection) return this.notFound(`Collection ${collectionId}`);
    const index = collection.items.findIndex(i => i.id === item.id);
    if (index >= 0) collection.items[index] = clone(item);
    else collection.items.push(clone(item));
    this.persist();
    return this.respond(item);
  }

  deleteItem(collectionId: string, itemId: string): Observable<void> {
    const collection = this.collections.find(c => c.id === collectionId);
    if (!collection) return this.notFound(`Collection ${collectionId}`);
    collection.items = collection.items.filter(i => i.id !== itemId);
    this.persist();
    return this.respond(undefined);
  }

  // --- store / tenant / profile ---

  listStoreListings(): Observable<StoreListing[]> {
    return this.respond(SEED_STORE);
  }

  listTenantMembers(): Observable<Member[]> {
    return this.respond(this.tenantMembers);
  }

  updateTenantMembers(members: Member[]): Observable<Member[]> {
    this.tenantMembers = clone(members);
    this.persist();
    return this.respond(members);
  }

  getProfile(): Observable<UserProfile> {
    return this.respond(this.profile);
  }

  updateProfile(profile: UserProfile): Observable<UserProfile> {
    this.profile = clone(profile);
    this.persist();
    return this.respond(profile);
  }

  // --- plumbing ---

  private respond<T>(payload: T): Observable<T> {
    return of(clone(payload)).pipe(delay(LATENCY));
  }

  private notFound<T>(what: string): Observable<T> {
    return throwError(() => new Error(`${what} not found`)).pipe(delay(LATENCY));
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.collections, JSON.stringify(this.collections));
      localStorage.setItem(STORAGE_KEYS.tenant, JSON.stringify(this.tenantMembers));
      localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(this.profile));
    } catch {
      // Storage full or unavailable — mock keeps working in memory.
    }
  }

  private readStorage<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
