import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';

import { ArchiveApi, ReplaceDecision } from '../api/archive-api';
import { VaultApi, VaultConflictError, VersionedCollection } from '../api/vault-api';
import { ConflictService } from './conflict.service';
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
  private readonly conflicts = inject(ConflictService);
  private readonly currencies = inject(CurrencyService);
  private readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);

  private readonly collectionsState = signal<Collection[]>([]);
  /**
   * The version this app last synchronised with, per collection — the token
   * every write of that collection has to quote back.
   *
   * A plain `Map` and not a signal: nothing renders it, and making it reactive
   * would invite a template to depend on a value whose only meaning is "what to
   * send next". It is here rather than on the `Collection` objects because a
   * page holds its own long-lived copy of one — the settings page edits a draft
   * for as long as the tab is open — and a token frozen into that copy would go
   * stale the moment the page saved once. What has to be quoted is the version
   * *the app* is at, which is what this holds.
   */
  private readonly versions = new Map<string, string>();
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
    // Cleared and rebuilt, never merged: a version left over from before a
    // reload describes a document nobody is holding any more.
    this.versions.clear();
    this.collectionsState.set(collections.map(v => this.remember(v)));
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
    const created = this.remember(
      await firstValueFrom(this.api.createCollection({ name, description })),
    );
    this.collectionsState.update(all => [...all, created]);
    return created;
  }

  /**
   * Persists a modified collection (metadata, groups, members, link sharing).
   * Pass a fully updated copy — never mutate store state in place.
   *
   * Rejects with a {@link VaultConflictError} when somebody else saved first.
   * **Nothing was written** in that case, and nothing here is changed either —
   * the caller's screen is still the only copy of what the user typed, which is
   * why every caller has to catch rather than navigate away.
   */
  async updateCollection(updated: Collection): Promise<void> {
    // Read synchronously, before the first await. This is the closest thing
    // there is to "the version the payload was derived from": the page built
    // `updated` from what the store held a moment ago, so the token current at
    // the moment it asked to save is the one that describes it. Reading it after
    // an await would quote a version that a write finishing in between had
    // already moved, and the guard would pass exactly when it should not.
    const version = this.versionFor(updated.id);
    const saved = await this.guard(updated.id, this.api.updateCollection(updated, version));
    this.replace(this.remember(saved));
  }

  async deleteCollection(id: string): Promise<void> {
    await firstValueFrom(this.api.deleteCollection(id));
    this.versions.delete(id);
    this.collectionsState.update(all => all.filter(c => c.id !== id));
  }

  async importStoreListing(listingId: string): Promise<Collection | null> {
    try {
      const created = this.remember(await firstValueFrom(this.api.importStoreListing(listingId)));
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
  async importArchive(file: File, replace?: readonly ReplaceDecision[]): Promise<Collection[]> {
    const imported = (await this.archives.importArchive(file, replace)).map(v => this.remember(v));
    this.collectionsState.update(all => {
      const byId = new Map(imported.map(c => [c.id, c]));
      const overwritten = all.map(c => byId.get(c.id) ?? c);
      const known = new Set(all.map(c => c.id));
      return [...overwritten, ...imported.filter(c => !known.has(c.id))];
    });
    return imported;
  }

  // --- items ---

  /**
   * Saves one item. Rejects with a {@link VaultConflictError} exactly like
   * {@link updateCollection} — the server guards item writes with the
   * collection's version, because there is nowhere to keep a per-item one.
   */
  async upsertItem(collectionId: string, item: Item): Promise<void> {
    const version = this.versionFor(collectionId);
    const saved = await this.guard(collectionId, this.api.upsertItem(collectionId, item, version));
    this.versions.set(collectionId, saved.version);
    this.collectionsState.update(all =>
      all.map(c => {
        if (c.id !== collectionId) return c;
        const exists = c.items.some(i => i.id === saved.item.id);
        return {
          ...c,
          items: exists
            ? c.items.map(i => (i.id === saved.item.id ? saved.item : i))
            : [...c.items, saved.item],
        };
      }),
    );
  }

  async deleteItem(collectionId: string, itemId: string): Promise<void> {
    // Unguarded on the server, but it still moves the version — so the token it
    // answers with has to be kept, or the next save would be refused for a
    // change this app made itself.
    const version = await firstValueFrom(this.api.deleteItem(collectionId, itemId));
    this.versions.set(collectionId, version);
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

  // --- versions ---

  /** Records a collection's version and hands back the document. */
  private remember(versioned: VersionedCollection): Collection {
    this.versions.set(versioned.collection.id, versioned.version);
    return versioned.collection;
  }

  private replace(saved: Collection): void {
    this.collectionsState.update(all => all.map(c => (c.id === saved.id ? saved : c)));
  }

  /**
   * The token a write of this collection must quote.
   *
   * Missing means this app never synchronised with the collection it is being
   * asked to overwrite — after a failed reload, say. Sending the write anyway is
   * not an option (there is nothing to send), and inventing a token would ask
   * the server to accept a document derived from nothing. So it raises the same
   * notice a real conflict does: the honest answer is "reload first", and the
   * user's work stays on screen either way.
   */
  private versionFor(collectionId: string): string {
    const version = this.versions.get(collectionId);
    if (version === undefined) {
      const message = this.i18n.t('conflict.unknownVersion');
      this.conflicts.raise({ collectionId, message });
      throw new VaultConflictError(collectionId, message);
    }
    return version;
  }

  /**
   * Runs a guarded write, putting a refusal in front of the user before it is
   * rethrown.
   *
   * Reported here rather than at each call site on purpose. There are seven
   * places that save a collection or an item, and a conflict that one of them
   * forgot to surface is a save the user believes happened. The rethrow is what
   * lets the page do the other half — stay put, keep the form as it is — and a
   * page that only needs the default gets it for free.
   */
  private async guard<T>(collectionId: string, write: Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(write);
    } catch (err) {
      if (err instanceof VaultConflictError) {
        this.conflicts.raise({ collectionId, message: err.message });
      }
      throw err;
    }
  }
}
