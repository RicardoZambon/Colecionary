import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { ImagesApi } from '../../../core/api/images-api';
import { I18nService, MessageKey } from '../../../core/i18n';
import { ImageFocusService } from '../../../core/state/image-focus.service';
import { isReportedWriteFailure } from '../../../core/api/vault-api';
import { ConfirmService } from '../../../core/state/confirm.service';
import { ToastService } from '../../../core/state/toast.service';
import { PhotoUploadService } from '../../../core/state/photo-upload.service';
import { VaultStore } from '../../../core/state/vault.store';
import { CopyStatus, CustomFieldValue, GroupField, Item } from '../../../core/models';
import { NO_FILTERS, Neighbours, neighbours, visibleItems } from '../../../core/utils/browse.util';
import {
  copyValue,
  copyValueIsPaid,
  isOwned,
  newCopy,
  ownedValue,
  paidTotal,
  syncWantedTag,
  unitValue,
  valueIsPaid,
} from '../../../core/utils/copies.util';
import { formatDate } from '../../../core/utils/date.util';
import { formatFieldValue } from '../../../core/utils/field-format.util';
import { editableTags } from '../../../core/utils/tags.util';
import { copyFields, fieldsFor, groupById, itemFields, pathOf } from '../../../core/utils/groups.util';
import { groupLinkParams, readCriteria, tagParams } from '../browse-params';
import { formatMoney } from '../../../core/utils/money.util';
import { conditionLabelKey, conditionTone, itemBadgeLabel, itemTone } from '../../../shared/ui/badge/badge';
import { ItemValuePipe } from '../../../shared/pipes/item-value.pipe';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { TPipe } from '../../../shared/pipes/t.pipe';
import {
  UiBadge,
  UiButton,
  UiCard,
  UiEmpty,
  UiIcon,
  UiChip,
  UiLightbox,
  UiProgress,
  UiSectionLabel,
  UiSkeleton,
} from '../../../shared/ui';

/** Mirrors the item form's own ceiling; the server validates the same number. */
const MAX_PHOTOS = 8;

/** Null for the default, so only a notable status shows up on a copy row. */
const STATUS_KEYS: Record<CopyStatus, MessageKey | null> = {
  Keep: null,
  ForTrade: 'copyStatus.forTrade',
  ForSale: 'copyStatus.forSale',
};


/**
 * One field's value as this page draws it: formatted by its declared type, and
 * an em dash where there is none.
 *
 * Takes the value list rather than the record that holds it, because an item
 * and a copy carry the same shape and the same rule — the only difference is
 * which of them the value describes. Formatting goes through the same
 * `formatFieldValue` the table uses, so a date field does not read `2024-03-11`
 * here and `11/03/2024` one screen away.
 */
function fieldRow(values: CustomFieldValue[], field: GroupField, locale: string): string {
  const raw = values.find(entry => entry.key === field.name)?.value ?? '';
  return formatFieldValue(raw, field.type, locale) || '—';
}

@Component({
  selector: 'app-item-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ItemValuePipe,
    MoneyPipe,
    TPipe,
    UiBadge,
    UiEmpty,
    UiButton,
    UiCard,
    UiChip,
    UiIcon,
    UiLightbox,
    UiProgress,
    UiSectionLabel,
    UiSkeleton,
  ],
  templateUrl: './item-page.html',
  styleUrl: './item-page.scss',
  host: { '(document:keydown)': 'onKeydown($event)' },
})
export class ItemPage {
  /**
   * Whether to offer the write affordances at all.
   *
   * A courtesy, not a control — see the doc comment on VaultStore.canEdit.
   */
  protected readonly canEdit = computed(() => this.store.canEdit());

  protected readonly store = inject(VaultStore);

  /** The vault is still in flight — not the same fact as 'no such collection'. */
  protected readonly loading = computed(() => !this.store.loaded());
  protected readonly images = inject(ImagesApi);
  protected readonly focus = inject(ImageFocusService);
  private readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  protected readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);
  /**
   * The same queue the item form's dropzone feeds. Going through it is what
   * gives this page the local size/type checks, the progress rows and the
   * per-file failure reporting that `images.upload` on its own has none of.
   */
  protected readonly uploads = inject(PhotoUploadService);

  readonly collectionId = input.required<string>();
  readonly itemId = input.required<string>();
  /**
   * The list this item was opened from, as the grid had it: group, filters and
   * order, all off the URL because every item link preserves the query string.
   * Rebuilding it here is what lets the arrows step to the next item of *that*
   * list rather than to whatever happens to come next in the collection.
   */
  readonly g = input<string | undefined>(undefined);
  readonly s = input<string | undefined>(undefined);
  readonly cond = input<string | undefined>(undefined);
  readonly own = input<string | undefined>(undefined);
  readonly tag = input<string | undefined>(undefined);
  readonly sort = input<string | undefined>(undefined);
  readonly dir = input<string | undefined>(undefined);

  protected readonly selectedPhoto = signal(0);

  /**
   * Id alongside both renditions: the id resolves the photo's framing, and the
   * strip and the main image want very different numbers of pixels — a 64px
   * thumbnail served the display copy is most of this page's weight.
   */
  protected readonly photos = computed(
    () =>
      this.item()?.photoIds.map(id => ({
        id,
        url: this.images.url(id, 'display')!,
        thumb: this.images.url(id, 'thumb')!,
      })) ?? [],
  );

  /** Photo ids alone, for the viewer. */
  protected readonly photoIds = computed(() => this.item()?.photoIds ?? []);

  protected readonly viewerOpen = signal(false);

  protected readonly mainPhoto = computed(() => {
    const photos = this.photos();
    if (!photos.length) return null;
    return photos[Math.min(this.selectedPhoto(), photos.length - 1)];
  });

  protected readonly collection = computed(() => this.store.collection(this.collectionId()));

  /** This collection's currency; every amount on the page is denominated in it. */
  protected readonly currency = computed(() => this.store.currencyFor(this.collectionId()));
  protected readonly item = computed(() =>
    this.collection()?.items.find(i => i.id === this.itemId()),
  );

  constructor() {
    // Stepping to a sibling item is the same route with a different param, so
    // Angular reuses this component — the gallery has to be told to go back to
    // the first photo or it would keep the previous item's selection.
    effect(() => {
      this.itemId();
      this.selectedPhoto.set(0);
    });

    // The queue is shared and root-provided, so a failure row left behind here
    // would render above the *next* item's dropzone, naming a file with nothing
    // to do with it. `UiPhotoManager` does the same on its own destroy; the
    // rule is that whichever surface is showing the queue owns it.
    inject(DestroyRef).onDestroy(() => this.uploads.clear());
  }

  // --- browsing the group ---

  /** The list the grid was showing, rebuilt from the URL. */
  private readonly ordered = computed(() => {
    const collection = this.collection();
    if (!collection) return [];
    return visibleItems(
      collection.items,
      collection,
      readCriteria(
        {
          s: this.s(),
          cond: this.cond(),
          own: this.own(),
          tag: this.tag(),
          sort: this.sort(),
          dir: this.dir(),
        },
        this.g() ?? null,
        this.store.query(),
        { sections: collection.sections, items: collection.items },
      ),
      collection.sections,
    );
  });

  /**
   * Where this item sits in that list and what it can step to.
   *
   * When the filters exclude the very item you have open — a deep link, or a
   * filter that moved on — stepping still works off the group's own order, but
   * no position is shown: a confident wrong number is worse than none.
   */
  protected readonly browse = computed<Neighbours>(() => {
    const inList = neighbours(this.ordered(), this.itemId());
    if (inList.position) return inList;

    const collection = this.collection();
    if (!collection) return inList;
    const canonical = visibleItems(
      collection.items,
      collection,
      { groupId: this.g() ?? null, ...NO_FILTERS },
      // The sections still apply: dropping the filters must not also reshuffle
      // the fallback order, or the arrows would step through a sequence the
      // grid never showed.
      collection.sections,
    );
    return { ...neighbours(canonical, this.itemId()), position: 0 };
  });

  /** Hidden entirely when there is no sequence to walk, not shown as dead. */
  protected readonly canBrowse = computed(() => {
    const browse = this.browse();
    return !!(browse.previous || browse.next || browse.position);
  });

  protected browseLink(item: Item): unknown[] {
    return ['/c', this.collectionId(), 'items', item.id];
  }

  /**
   * Whether something is covering the page.
   *
   * The photo viewer, the framing editor and a confirmation are all rendered
   * from outside this component — two of them from the shell — so nothing about
   * their markup can be recognised by a `closest()` test. Each of them owns a
   * signal that says it is up, and this is the sum of the three.
   */
  protected readonly overlayOpen = computed(
    () => this.viewerOpen() || !!this.focus.pending() || !!this.confirm.pending(),
  );

  /**
   * ← and → walk the group. They belong to the items, except while the focus is
   * inside the thumbnail strip, where the user has already said they mean
   * photos — and they never fire in a field that uses them to move a caret.
   *
   * **And never through an overlay.** This is a document listener, so it used
   * to fire while the framing editor was open (every arrow nudge also stepped
   * the page behind to the next item), while the viewer was open (→ advanced
   * the photo *and* the item), and while the delete confirmation was open (←
   * navigated away, and confirming then deleted an item nobody could see).
   * Registration order cannot fix it: `ui-lightbox` is a child of this
   * template, so its own listener is added second and this one wins.
   */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (this.overlayOpen()) return;

    // `closest` and not an instanceof test, but the event can be dispatched on
    // the document itself, which has neither — so ask before calling.
    const target = event.target as HTMLElement | null;
    if (typeof target?.closest !== 'function') return;
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return;

    const back = event.key === 'ArrowLeft';

    if (target.closest('.gallery__thumbs')) {
      const total = this.photos().length;
      if (!total) return;
      const next = Math.min(Math.max(this.selectedPhoto() + (back ? -1 : 1), 0), total - 1);
      if (next === this.selectedPhoto()) return;
      event.preventDefault();
      this.selectedPhoto.set(next);
      return;
    }

    const step = back ? this.browse().previous : this.browse().next;
    if (!step) return;
    event.preventDefault();
    void this.router.navigate(this.browseLink(step), { queryParamsHandling: 'preserve' });
  }

  protected readonly tone = computed(() => {
    const item = this.item();
    return item ? itemTone(item) : 'neutral';
  });
  protected readonly badge = computed(() => {
    const item = this.item();
    return item ? itemBadgeLabel(item, this.i18n.t) : '';
  });

  protected readonly owned = computed(() => {
    const item = this.item();
    return item ? isOwned(item) : false;
  });
  protected readonly ownedValue = computed(() => {
    const item = this.item();
    return item ? ownedValue(item) : 0;
  });
  protected readonly paidTotal = computed(() => {
    const item = this.item();
    return item ? paidTotal(item) : 0;
  });

  /** The per-unit figure, whatever it turned out to be derived from. */
  protected readonly unitValue = computed(() => {
    const item = this.item();
    return item ? unitValue(item) : 0;
  });
  /** Drives both the `≈` and the "Paid / copy" relabelling of the details row. */
  protected readonly fromPaid = computed(() => {
    const item = this.item();
    return item ? valueIsPaid(item) : false;
  });
  protected readonly valuePerCopyKey = computed<MessageKey>(() =>
    this.fromPaid() ? 'item.valuePaidPerCopy' : 'item.valuePerCopy',
  );
  /** The big number: everything held, or the reference figure for a wantlist item. */
  protected readonly headlineValue = computed(() =>
    this.owned() ? this.ownedValue() : this.unitValue(),
  );

  protected readonly copyRows = computed(() => {
    const item = this.item();
    if (!item) return [];
    const declared = copyFields(this.declaredFields());
    return item.copies.map(copy => ({
      ...copy,
      // Only the declared ones, in the declared order: a value whose field a
      // move or a rename left undeclared is dormant, not deleted, and showing
      // it here would contradict the group-move preview that promised it would
      // stop being displayed.
      fields: declared.map(field => ({
        key: field.name,
        value: fieldRow(copy.custom, field, this.i18n.locale()),
      })),
      tone: conditionTone(copy.condition),
      conditionKey: conditionLabelKey(copy.condition),
      value: copyValue(item, copy),
      valueFromPaid: copyValueIsPaid(item, copy),
      // Status is only worth showing when it is not the default.
      statusKey: STATUS_KEYS[copy.status],
      acquiredOnLabel: formatDate(copy.acquiredOn, this.i18n.locale()),
    }));
  });

  /**
   * A one-copy item is the common case, and the hero already carries the
   * condition badge, the estimate and the price paid. Repeating all three in a
   * "Copies · 1" card and then again in a summary line underneath made the page
   * read as though something had gone wrong with it, and pushed the description
   * and the declared fields below the fold.
   *
   * So for a single copy the card renders only what the hero cannot — the
   * acquisition date, a notable status, the notes and the copy-scoped fields —
   * and not at all when it has none of them.
   */
  protected readonly singleCopy = computed(() => (this.item()?.copies.length ?? 0) === 1);

  protected readonly showCopies = computed(() => {
    const rows = this.copyRows();
    if (!rows.length) return false;
    if (rows.length > 1) return true;
    const only = rows[0];
    return !!(only.acquiredOnLabel || only.statusKey || only.notes || only.fields.length);
  });

  /** The summary line restates a lone row word for word, so it waits for two. */
  protected readonly showCopiesTotal = computed(() => this.copyRows().length > 1);

  /**
   * "Est. value / copy" in the details card is the hero figure divided by one,
   * which for a single copy it always equals. Printing it a third time says
   * nothing the reader did not already read twice.
   */
  protected readonly showUnitValue = computed(
    () => !this.singleCopy() || this.unitValue() !== this.headlineValue(),
  );

  protected readonly copiesTotal = computed(() => {
    const item = this.item();
    if (!item) return '';
    const count = item.copies.length;
    const one = count === 1;
    // No "est." clause when the estimate *is* the price paid — restating the
    // same figure twice in one line reads as two independent numbers.
    const key: MessageKey = this.fromPaid()
      ? one
        ? 'item.copyTotalPaid.one'
        : 'item.copyTotalPaid.other'
      : one
        ? 'item.copyTotal.one'
        : 'item.copyTotal.other';
    return this.i18n.t(key, {
      n: count,
      paid: formatMoney(this.paidTotal(), this.i18n.locale(), this.currency()),
      value: formatMoney(this.ownedValue(), this.i18n.locale(), this.currency()),
    });
  });

  /**
   * The tags, each as a link that filters the collection by it.
   *
   * `editableTags` drops the derived `wanted` tag, exactly as the editor does:
   * it is not a label anybody applied, and `readTag` refuses it on the way back
   * in, so a chip for it would navigate to no filter at all.
   *
   * The query params are built here rather than as an object literal in the
   * template, so an OnPush check does not hand `ui-chip` a new object — and so
   * the link stays stable while the page's own `?tag=` changes around it.
   */
  protected readonly tags = computed(() =>
    editableTags(this.item()?.tags ?? []).map(name => ({ name, params: tagParams(name) })),
  );

  /**
   * Where a tag chip goes: the collection, not a filtered copy of this page.
   *
   * `ui-chip` merges the query string, so the group, the order and any other
   * filter already in the URL come along and the tag is one more predicate on
   * the very list this item was opened from.
   */
  protected readonly collectionLink = computed(() => ['/c', this.collectionId()]);

  protected readonly groupPath = computed(() => {
    const collection = this.collection();
    const item = this.item();
    if (!collection || !item) return '';
    const path = pathOf(collection.groups, item.groupId).map(g => g.name);
    return path.length ? path.join(' / ') : item.groupId;
  });

  /** The whole field set in force for this item — both scopes, merged once. */
  private readonly declaredFields = computed(() => {
    const collection = this.collection();
    const item = this.item();
    return collection && item ? fieldsFor(collection, item.groupId) : [];
  });

  protected readonly groupFieldRows = computed(() => {
    const item = this.item();
    if (!item) return [];
    return itemFields(this.declaredFields()).map(field => ({
      key: field.name,
      value: fieldRow(item.custom, field, this.i18n.locale()),
    }));
  });

  /**
   * Where "GRUPO Nintendo" goes: the collection, filtered to that group.
   *
   * The two most natural questions from an item — what else is in this group,
   * what else carries this tag — were both dead text. `groupLinkParams` keeps
   * the filters already in the URL and drops the ad-hoc order, since every
   * group declares its own.
   */
  protected readonly groupLink = computed(() =>
    groupLinkParams(this.item()?.groupId || null),
  );

  protected readonly groupName = computed(() => {
    const collection = this.collection();
    const item = this.item();
    if (!collection || !item) return '';
    return groupById(collection.groups, item.groupId)?.name ?? item.groupId;
  });

  /**
   * Whether this collection already has a write in flight.
   *
   * Read here and passed *down* as an input, never injected into a leaf. It is
   * what stops the `+` and "I own one" offering themselves during their own
   * write: the second one quotes the version the first is about to move and
   * comes back as a `VaultBusyError` that `isReportedWriteFailure` swallows
   * without a toast — which is right for a double-clicked Save and wrong here,
   * because the second click carried a *different* photo (rule 20).
   */
  protected readonly saving = computed(() => this.store.saving(this.collectionId()));

  /** Neither adding nor picking is offered while either is already happening. */
  protected readonly photoBusy = computed(() => this.saving() || this.uploads.busy());

  /**
   * Adds photos from the detail page, through the same queue the form uses.
   *
   * It used to call `images.upload` directly, which meant: no progress row (so
   * several seconds of a page that did not change, which invites a second
   * click), no local size or type check (so a 20 MB PDF was uploaded in full
   * before the server refused it, where the form rejects it instantly), and
   * `multiple` unset, so it took one file where the form takes a batch.
   */
  protected addPhoto(): void {
    const item = this.item();
    if (!item) return;
    const remaining = MAX_PHOTOS - item.photoIds.length;
    if (remaining <= 0) {
      this.toast.flash(this.i18n.t('toast.photo.limit'));
      return;
    }
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'image/*';
    picker.multiple = true;
    picker.onchange = async () => {
      const files = [...(picker.files ?? [])];
      if (!files.length) return;
      const ids = await this.uploads.add(files, remaining);
      if (!ids.length) return;
      // Read back from the store, not from the `item` captured above: an upload
      // takes seconds and the collection can have moved on underneath it.
      const current = this.item();
      if (!current) return;
      const before = current.photoIds.length;
      if (!(await this.write({ ...current, photoIds: [...current.photoIds, ...ids] }))) return;
      this.selectedPhoto.set(before);
      this.toast.flash(this.i18n.t('toast.photo.added'));
    };
    picker.click();
  }

  /**
   * Takes a photo back off the item — the other half of adding one here.
   *
   * Without this, a wrong file picked from the detail page could only be undone
   * by a round trip through the edit form, which is the surface that owns
   * ordering and the cover. The bytes survive their grace period, but nothing
   * in the app offers them back, so this asks first.
   */
  protected async removePhoto(imageId: string): Promise<void> {
    const item = this.item();
    if (!item) return;
    const confirmed = await this.confirm.ask({
      titleKey: 'confirm.removePhoto.title',
      bodyKey: 'confirm.removePhoto.body',
      confirmKey: 'confirm.removePhoto.confirm',
      tone: 'danger',
    });
    if (!confirmed) return;
    const next = item.photoIds.filter(id => id !== imageId);
    if (!(await this.write({ ...item, photoIds: next }))) return;
    this.selectedPhoto.update(i => Math.max(0, Math.min(i, next.length - 1)));
  }

  /**
   * One write path for the page's own photo edits, so the failure story is
   * told once. Resolves false when nothing was persisted.
   */
  private async write(item: Item): Promise<boolean> {
    try {
      await this.store.upsertItem(this.collectionId(), item);
      return true;
    } catch (err) {
      // A conflict and a refused-because-busy both already explain themselves
      // through the shell. The photo's bytes are safe either way — it is the
      // item that did not save.
      if (!isReportedWriteFailure(err)) {
        this.toast.flash(
          err instanceof Error ? err.message : this.i18n.t('toast.photo.uploadFailed'),
        );
      }
      return false;
    }
  }

  /** Reopens the editor for an existing photo — framing is never final. */
  protected reframe(imageId: string): void {
    void this.focus.frame(imageId, 'item');
  }

  protected async markOwned(): Promise<void> {
    const item = this.item();
    if (!item) return;
    // Owning something means having a copy of it — so add one.
    try {
      await this.store.upsertItem(
        this.collectionId(),
        syncWantedTag({ ...item, copies: [...item.copies, newCopy()] }),
      );
    } catch (err) {
      if (!isReportedWriteFailure(err)) {
        this.toast.flash(
          err instanceof Error ? err.message : this.i18n.t('toast.item.saveFailed'),
        );
      }
      return;
    }
    this.toast.flash(this.i18n.t('toast.copy.added'));
  }

  /**
   * Deletes the item — asking first, and offering it back afterwards.
   *
   * This was one unconfirmed click that destroyed an item and navigated away,
   * with no dialog anywhere in the app and no undo anywhere either. Both halves
   * are here now, and **undo is the more important one**: it is what allows the
   * dialog to stay a single sentence rather than a form with a checkbox and a
   * typed confirmation. A question that is cheap to answer wrongly is fine when
   * the wrong answer is reversible.
   *
   * The item object is retained before the call, not read back afterwards — by
   * then it is gone from the store — and it is the whole `Item`, so a restore
   * brings back the copies, the tags, the field values, the group, the section
   * and the photo ids. The image bytes were never touched by the delete, so the
   * photos come back with it.
   */
  protected async deleteItem(): Promise<void> {
    const item = this.item();
    if (!item) return;

    const confirmed = await this.confirm.ask({
      titleKey: 'item.delete.confirm.title',
      bodyKey: 'item.delete.confirm.body',
      params: { name: item.name },
      confirmKey: 'item.delete.confirm.ok',
      tone: 'danger',
    });
    if (!confirmed) return;

    const collectionId = this.collectionId();
    // Held before the delete: after it, the store no longer has this item and
    // there would be nothing left to put back.
    const restorable = item;

    try {
      await this.store.deleteItem(collectionId, item.id);
    } catch {
      // Not navigating on a failed delete: leaving for a list that still shows
      // the item would read as "it worked, but it is still there". The reason is
      // already on screen — `errorInterceptor` reports every failed request —
      // so this adds what only the page knows.
      this.toast.error(this.i18n.t('toast.item.deleteFailed'));
      return;
    }

    this.toast.flash(this.i18n.t('toast.item.deleted'), {
      labelKey: 'toast.undo',
      run: () => this.restoreItem(collectionId, restorable),
    });
    void this.router.navigate(['/c', collectionId], { queryParamsHandling: 'preserve' });
  }

  /**
   * Puts a deleted item back, or says plainly that it could not.
   *
   * Two honest limits, both of them consequences of how the aggregate is
   * versioned and ordered rather than of this method:
   *
   * - **A restore is a version-guarded write like any other.** The delete moved
   *   the collection on and the store kept the token it answered with, so an
   *   undo taken straight away goes through. If somebody else saved that
   *   collection in between, the write is refused, `ConflictService` raises the
   *   notice that explains it, and the item stays deleted — so this adds a toast
   *   saying the undo itself failed, because "reload and try again" does not
   *   bring an item back and the user must not be left assuming it did.
   * - **Manual order is the array order of `collection.items`, and nothing
   *   persists an index per item.** A restored item therefore lands at the end
   *   of its group rather than in the row it came from. Everything else about it
   *   is exactly as it was.
   */
  private async restoreItem(collectionId: string, item: Item): Promise<void> {
    try {
      await this.store.upsertItem(collectionId, item);
      this.toast.success(this.i18n.t('toast.item.restored', { name: item.name }));
    } catch {
      this.toast.error(this.i18n.t('toast.item.undoFailed', { name: item.name }));
    }
  }
}
