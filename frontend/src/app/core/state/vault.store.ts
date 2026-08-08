import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { VaultApi } from '../api/vault-api';
import { ToastService } from './toast.service';
import { Collection, Item, Member, StoreListing, UserProfile } from '../models';
import { ownedValue } from '../utils/copies.util';

/**
 * Signal-based application state for collections, store listings, tenant
 * members and the user profile. All mutations go through the {@link VaultApi}
 * first; local state is updated from the API response, so the store behaves
 * the same against the mock backend and a real one.
 */
@Injectable({ providedIn: 'root' })
export class VaultStore {
  private readonly api = inject(VaultApi);
  private readonly toast = inject(ToastService);

  private readonly collectionsState = signal<Collection[]>([]);
  private readonly storeListingsState = signal<StoreListing[]>([]);
  private readonly tenantMembersState = signal<Member[]>([]);
  private readonly profileState = signal<UserProfile | null>(null);

  readonly collections = this.collectionsState.asReadonly();
  readonly storeListings = this.storeListingsState.asReadonly();
  readonly tenantMembers = this.tenantMembersState.asReadonly();
  readonly profile = this.profileState.asReadonly();
  readonly loaded = signal(false);

  /** Global item search text (bound to the top-bar input). */
  readonly query = signal('');

  readonly totalItems = computed(() =>
    this.collections().reduce((acc, c) => acc + c.items.length, 0),
  );
  readonly totalCopies = computed(() =>
    this.collections().reduce(
      (acc, c) => acc + c.items.reduce((x, i) => x + i.copies.length, 0),
      0,
    ),
  );
  readonly totalOwnedValue = computed(() =>
    this.collections().reduce(
      (acc, c) => acc + c.items.reduce((x, i) => x + ownedValue(i), 0),
      0,
    ),
  );
  readonly totalGroups = computed(() =>
    this.collections().reduce((acc, c) => acc + c.groups.length, 0),
  );

  async load(): Promise<void> {
    const [collections, listings, members, profile] = await Promise.all([
      firstValueFrom(this.api.listCollections()),
      firstValueFrom(this.api.listStoreListings()),
      firstValueFrom(this.api.listTenantMembers()),
      firstValueFrom(this.api.getProfile()),
    ]);
    this.collectionsState.set(collections);
    this.storeListingsState.set(listings);
    this.tenantMembersState.set(members);
    this.profileState.set(profile);
    this.loaded.set(true);
  }

  collection(id: string | null | undefined): Collection | undefined {
    return this.collections().find(c => c.id === id);
  }

  // --- collections ---

  async createCollection(name: string, description: string): Promise<Collection> {
    const created = await firstValueFrom(this.api.createCollection({ name, description }));
    this.collectionsState.update(all => [...all, created]);
    return created;
  }

  /**
   * Persists a modified collection (metadata, groups, members, link sharing).
   * Pass a fully updated copy — never mutate store state in place.
   */
  async updateCollection(updated: Collection): Promise<void> {
    const saved = await firstValueFrom(this.api.updateCollection(updated));
    this.collectionsState.update(all => all.map(c => (c.id === saved.id ? saved : c)));
  }

  async deleteCollection(id: string): Promise<void> {
    await firstValueFrom(this.api.deleteCollection(id));
    this.collectionsState.update(all => all.filter(c => c.id !== id));
  }

  async importStoreListing(listingId: string): Promise<Collection | null> {
    try {
      const created = await firstValueFrom(this.api.importStoreListing(listingId));
      this.collectionsState.update(all => [...all, created]);
      return created;
    } catch (err) {
      this.toast.flash(err instanceof Error ? err.message : 'Could not add checklist');
      return null;
    }
  }

  // --- items ---

  async upsertItem(collectionId: string, item: Item): Promise<void> {
    const saved = await firstValueFrom(this.api.upsertItem(collectionId, item));
    this.collectionsState.update(all =>
      all.map(c => {
        if (c.id !== collectionId) return c;
        const exists = c.items.some(i => i.id === saved.id);
        return {
          ...c,
          items: exists ? c.items.map(i => (i.id === saved.id ? saved : i)) : [...c.items, saved],
        };
      }),
    );
  }

  async deleteItem(collectionId: string, itemId: string): Promise<void> {
    await firstValueFrom(this.api.deleteItem(collectionId, itemId));
    this.collectionsState.update(all =>
      all.map(c => (c.id === collectionId ? { ...c, items: c.items.filter(i => i.id !== itemId) } : c)),
    );
  }

  // --- tenant / profile ---

  async updateTenantMembers(members: Member[]): Promise<void> {
    const saved = await firstValueFrom(this.api.updateTenantMembers(members));
    this.tenantMembersState.set(saved);
  }

  async updateProfile(profile: UserProfile): Promise<void> {
    const saved = await firstValueFrom(this.api.updateProfile(profile));
    this.profileState.set(saved);
  }
}
