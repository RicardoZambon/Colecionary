import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ArchiveApi } from '../api/archive-api';
import { VaultApi } from '../api/vault-api';
import { CurrencyService } from './currency.service';
import { I18nService } from '../i18n/i18n.service';
import { ToastService } from './toast.service';
import { Collection, Item, Member, StoreListing, TenantSettings, UserProfile } from '../models';
import { ownedValue } from '../utils/copies.util';
import { currencyOf } from '../utils/currency.util';
import { CurrencyCode } from '../utils/money.util';

/**
 * Signal-based application state for collections, store listings, tenant
 * members and the user profile. All mutations go through the {@link VaultApi}
 * first; local state is updated from the API response, so the store behaves
 * the same against the mock backend and a real one.
 */
@Injectable({ providedIn: 'root' })
export class VaultStore {
  private readonly api = inject(VaultApi);
  private readonly archives = inject(ArchiveApi);
  private readonly currencies = inject(CurrencyService);
  private readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);

  private readonly collectionsState = signal<Collection[]>([]);
  private readonly storeListingsState = signal<StoreListing[]>([]);
  private readonly tenantMembersState = signal<Member[]>([]);
  private readonly profileState = signal<UserProfile | null>(null);
  private readonly tenantSettingsState = signal<TenantSettings | null>(null);

  readonly collections = this.collectionsState.asReadonly();
  readonly storeListings = this.storeListingsState.asReadonly();
  readonly tenantMembers = this.tenantMembersState.asReadonly();
  readonly profile = this.profileState.asReadonly();
  readonly tenantSettings = this.tenantSettingsState.asReadonly();
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
  /**
   * The account default, already narrowed to a code the formatter accepts.
   * Everything that renders an amount outside a collection reads this — and the
   * pipes read the same signal through {@link CurrencyService} directly.
   */
  readonly defaultCurrency = this.currencies.account;

  /**
   * Owned value split by the currency it is denominated in, largest first.
   *
   * Not one grand total: a collection can override the account's currency, and
   * adding BRL to USD produces a number that is not an amount of money in any
   * currency. Summing them would have been the cheaper display and the wrong
   * one. Callers render every entry; with a single currency in play — the
   * common case — there is exactly one and it reads as it always did.
   */
  readonly ownedValueByCurrency = computed<{ currency: CurrencyCode; total: number }[]>(() => {
    const totals = new Map<CurrencyCode, number>();
    for (const collection of this.collections()) {
      const currency = currencyOf(collection, this.defaultCurrency());
      const value = collection.items.reduce((acc, i) => acc + ownedValue(i), 0);
      totals.set(currency, (totals.get(currency) ?? 0) + value);
    }
    // An empty vault still has an account currency, and a stat tile with no
    // rows at all would render blank rather than as a zero.
    if (totals.size === 0) totals.set(this.defaultCurrency(), 0);
    return [...totals]
      .map(([currency, total]) => ({ currency, total }))
      .sort((a, b) => b.total - a.total || a.currency.localeCompare(b.currency));
  });
  readonly totalGroups = computed(() =>
    this.collections().reduce((acc, c) => acc + c.groups.length, 0),
  );

  async load(): Promise<void> {
    const [collections, listings, members, profile, settings] = await Promise.all([
      firstValueFrom(this.api.listCollections()),
      firstValueFrom(this.api.listStoreListings()),
      firstValueFrom(this.api.listTenantMembers()),
      firstValueFrom(this.api.getProfile()),
      firstValueFrom(this.api.getTenantSettings()),
    ]);
    this.collectionsState.set(collections);
    this.storeListingsState.set(listings);
    this.tenantMembersState.set(members);
    this.profileState.set(profile);
    this.tenantSettingsState.set(settings);
    this.currencies.apply(settings.defaultCurrency);
    this.loaded.set(true);
  }

  collection(id: string | null | undefined): Collection | undefined {
    return this.collections().find(c => c.id === id);
  }

  /**
   * The currency amounts in this collection are read in. Takes an id so a
   * template can ask without holding the collection, and falls back to the
   * account default for an id that no longer resolves.
   */
  currencyFor(collectionId: string | null | undefined): CurrencyCode {
    return currencyOf(this.collection(collectionId), this.defaultCurrency());
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
      // A server-side message arrives already translated (Accept-Language);
      // only the generic fallback is ours to localize.
      this.toast.flash(
        err instanceof Error ? err.message : this.i18n.t('toast.collection.addFailed'),
      );
      return null;
    }
  }

  /**
   * Restores collections from an archive — one collection or a whole vault.
   *
   * Without `replace`, the server stops and asks whenever the archive holds a
   * collection this vault already has by name, throwing
   * `ImportNeedsConfirmation` with the plan. Passing `replace` answers it: the
   * ids listed are overwritten wholesale, and every other archived collection
   * lands as a new one. An empty array is a valid answer — "create new ones" —
   * so it must be passed, not omitted.
   *
   * Results are folded in by id rather than appended: an overwritten collection
   * comes back under the id already on screen, and appending it would leave the
   * sidebar showing the same collection twice.
   */
  async importArchive(file: File, replace?: readonly string[]): Promise<Collection[]> {
    const imported = await this.archives.importArchive(file, replace);
    this.collectionsState.update(all => {
      const byId = new Map(imported.map(c => [c.id, c]));
      const overwritten = all.map(c => byId.get(c.id) ?? c);
      const known = new Set(all.map(c => c.id));
      return [...overwritten, ...imported.filter(c => !known.has(c.id))];
    });
    return imported;
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

  /** Owner-only on the server; the caller surfaces the rejection. */
  async updateTenantSettings(settings: TenantSettings): Promise<void> {
    const saved = await firstValueFrom(this.api.updateTenantSettings(settings));
    this.tenantSettingsState.set(saved);
    this.currencies.apply(saved.defaultCurrency);
  }
}
