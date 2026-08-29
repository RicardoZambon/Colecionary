import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';

import { ArchiveApi, ReplaceDecision } from '../api/archive-api';
import { VaultApi, VaultConflictError, VersionedCollection } from '../api/vault-api';
import { ConflictService } from './conflict.service';
import { CurrencyService } from './currency.service';
import { I18nService } from '../i18n/i18n.service';
import { MessageKey } from '../i18n/messages';
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

  /**
   * Whether this person may change catalogue content.
   *
   * Mirrors `VaultPolicies.CanWrite` on the server (Owner, Editor). It is a
   * *courtesy*, not a control: the 403 is the real answer, and this only stops
   * the app offering an action that would earn one. So it fails **open** while
   * the profile is still loading — briefly showing a button that turns out to be
   * refused is a smaller wrong than hiding the whole app's controls from an
   * Owner during a slow load.
   */
  readonly canEdit = computed(() => {
    const role = this.profileState()?.role;
    return role === undefined || role === 'Owner' || role === 'Editor';
  });

  /** Owner-only surfaces: membership, tenant settings, restoring an archive. */
  readonly canAdminister = computed(() => {
    const role = this.profileState()?.role;
    return role === undefined || role === 'Owner';
  });
  readonly tenantSettings = this.tenantSettingsState.asReadonly();
  readonly loaded = signal(false);

  /**
   * Why the initial load failed, or null.
   *
   * This exists because the alternative was the worst bug in the app. The shell
   * gates the router outlet on `loaded()`, `load()` sets that only at its very
   * end, and the caller swallowed the rejection — so an outage, a 500, a CORS
   * refusal or a timeout left the user reading the word "Loading…" for as long
   * as they were prepared to wait, with nothing on screen, nothing in the
   * console and no way forward. A failed load is now a *state*, which is what
   * makes it possible to render it and to offer {@link retryLoad}.
   *
   * A string rather than a boolean: the server usually explains itself, and
   * "Can't reach the Vault server" and "You don't have access to this vault" are
   * not the same problem for the person reading it.
   */
  readonly loadError = signal<string | null>(null);

  /** True while a retry is in flight, so the button can say so and go quiet. */
  readonly retrying = signal(false);

  /**
   * How many writes are in flight. Not exposed raw — {@link syncState} is what
   * the UI reads.
   */
  private readonly pendingWrites = signal(0);

  /**
   * What the sidebar's status line is actually allowed to claim.
   *
   * It used to be the hardcoded string `'● synced · v0.1 mock API'`: a
   * decorative dot that never changed, next to a claim about a mock API that
   * has not existed since the .NET backend landed, in the one part of the chrome
   * whose entire job is to say whether the user's work is safe. Now it is
   * derived, and every one of the four states can be reached:
   *
   * - `conflict` — a save was refused; `ConflictService` has the details.
   * - `offline` — the load failed and this app is showing nothing, or stale
   *   data.
   * - `saving` — a write is in flight.
   * - `synced` — nothing outstanding.
   *
   * Order matters: a conflict outranks a failed load outranks a write in
   * flight, because that is the order in which the user needs to hear about
   * them.
   */
  readonly syncState = computed<'synced' | 'saving' | 'offline' | 'conflict'>(() => {
    if (this.conflicts.pending()) return 'conflict';
    if (this.loadError()) return 'offline';
    if (this.pendingWrites() > 0) return 'saving';
    return 'synced';
  });

  /** The status line's label, as a key — never a dot on its own (rule 12). */
  readonly syncStatusKey = computed<MessageKey>(
    () => `nav.sync.${this.syncState()}` as MessageKey,
  );

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

  /**
   * Fills the store from the API. Records the failure and rethrows.
   *
   * Both halves matter. The rethrow is what lets the conflict notice's "reload"
   * button know whether it worked; {@link loadError} is what lets the shell
   * render a failure at all, instead of gating the router outlet on a `loaded`
   * flag that a failed load leaves false for ever.
   *
   * `loaded` is still set only at the end, on purpose: half a vault on screen is
   * worse than a message saying it did not load. What changed is that the other
   * outcome is now visible.
   */
  async load(): Promise<void> {
    try {
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
      this.loadError.set(null);
      this.loaded.set(true);
    } catch (err) {
      // The server's own sentence when there was one — `HttpVaultApi` has
      // already localized it — and ours only as a floor.
      this.loadError.set(
        err instanceof Error && err.message ? err.message : this.i18n.t('shell.loadFailed.body'),
      );
      throw err;
    }
  }

  /**
   * Loads once, whoever asks first, and never rejects.
   *
   * Exists for the route guards. A `CanActivateFn` runs *before* the component
   * tree is built, so on a cold navigation straight to a URL the guard is asked
   * "may this person write?" while `Shell` — the only thing that ever called
   * {@link load} — has not been constructed yet, and the honest answer would be
   * "nobody knows". Kicking off a second full load from the guard would then
   * fetch the whole vault twice on every such navigation, so the two callers
   * share one promise instead.
   *
   * It resolves rather than rejects on failure because the caller only ever
   * wants "we have tried". A guard that has no profile to read falls open, and
   * the shell renders {@link loadError} on the page it lands on — which is the
   * message the user actually needs to see.
   */
  async ensureLoaded(): Promise<void> {
    if (this.loaded()) return;
    this.loadInFlight ??= this.load()
      .catch(() => undefined)
      .finally(() => {
        this.loadInFlight = null;
      });
    await this.loadInFlight;
  }

  /** The shared {@link ensureLoaded} attempt, while one is running. */
  private loadInFlight: Promise<void> | null = null;

  /**
   * Tries the load again, and answers whether it worked.
   *
   * Swallows the rejection because this one is called straight from a click:
   * the outcome is already on screen either way — the vault, or the same
   * message with the button live again — and a rejected promise from a template
   * binding is exactly the silence this whole change is about.
   */
  async retryLoad(): Promise<boolean> {
    if (this.retrying()) return false;
    this.retrying.set(true);
    // Cleared up front so the shell shows "loading" rather than the stale
    // failure while the second attempt is in flight.
    this.loadError.set(null);
    try {
      await this.load();
      return true;
    } catch {
      return false;
    } finally {
      this.retrying.set(false);
    }
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

  /**
   * Creates a collection. Rejects if the server refused it, and local state is
   * left exactly as it was — the new collection is appended only from what came
   * back, never optimistically, so a failure cannot leave a phantom row in the
   * sidebar that vanishes on the next reload.
   */
  async createCollection(name: string, description: string): Promise<Collection> {
    const created = this.remember(
      await this.write(firstValueFrom(this.api.createCollection({ name, description }))),
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
    const saved = await this.write(this.guard(updated.id, this.api.updateCollection(updated, version)));
    this.replace(this.remember(saved));
  }

  async deleteCollection(id: string): Promise<void> {
    await this.write(firstValueFrom(this.api.deleteCollection(id)));
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
    const saved = await this.write(
      this.guard(collectionId, this.api.upsertItem(collectionId, item, version)),
    );
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
    const version = await this.write(firstValueFrom(this.api.deleteItem(collectionId, itemId)));
    this.versions.set(collectionId, version);
    this.collectionsState.update(all =>
      all.map(c => (c.id === collectionId ? { ...c, items: c.items.filter(i => i.id !== itemId) } : c)),
    );
  }

  // --- tenant / profile ---

  /**
   * Replaces the member list. Rejects on refusal — a role change is the classic
   * write whose *only* visible effect is the control the user just touched, so
   * the caller has to know, and the caller has to put the row back.
   */
  async updateTenantMembers(members: Member[]): Promise<void> {
    const saved = await this.write(firstValueFrom(this.api.updateTenantMembers(members)));
    this.tenantMembersState.set(saved);
  }

  async updateProfile(profile: UserProfile): Promise<void> {
    const saved = await this.write(firstValueFrom(this.api.updateProfile(profile)));
    this.profileState.set(saved);
  }

  /** Owner-only on the server; the caller surfaces the rejection. */
  async updateTenantSettings(settings: TenantSettings): Promise<void> {
    const saved = await this.write(firstValueFrom(this.api.updateTenantSettings(settings)));
    this.tenantSettingsState.set(saved);
    this.currencies.apply(saved.defaultCurrency);
  }

  // --- versions ---

  /**
   * Runs one write, counted, and lets the failure through.
   *
   * The counter is what makes {@link syncState} — and therefore the status line
   * — tell the truth about "saving", and the `finally` is why it can never get
   * stuck there: every path out of a write, including a rejection, decrements.
   *
   * It reports nothing. Reporting a failed HTTP call is `errorInterceptor`'s
   * job, in one voice, for every request in the app; a second message here
   * would be the same failure said twice in vaguer words. And it deliberately
   * rethrows rather than swallowing: only the caller knows whether the right
   * answer is to keep a form, stay on the page or put a control back, and a
   * store that resolved successfully on a refused write would take that
   * decision away from all of them.
   */
  private async write<T>(work: Promise<T>): Promise<T> {
    this.pendingWrites.update(n => n + 1);
    try {
      return await work;
    } finally {
      this.pendingWrites.update(n => n - 1);
    }
  }

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
