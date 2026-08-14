import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { ImagesApi } from '../../../core/api/images-api';
import { I18nService, MessageKey } from '../../../core/i18n';
import { ImageFocusService } from '../../../core/state/image-focus.service';
import { ToastService } from '../../../core/state/toast.service';
import { VaultStore } from '../../../core/state/vault.store';
import { CopyStatus, Item } from '../../../core/models';
import { NO_FILTERS, Neighbours, neighbours, visibleItems } from '../../../core/utils/browse.util';
import { copyValue, isOwned, newCopy, ownedValue, paidTotal, syncWantedTag } from '../../../core/utils/copies.util';
import { formatDate } from '../../../core/utils/date.util';
import { fieldsFor, groupById, pathOf } from '../../../core/utils/groups.util';
import { readCriteria } from '../browse-params';
import { formatMoney } from '../../../core/utils/money.util';
import { conditionLabelKey, conditionTone, itemBadgeLabel, itemTone } from '../../../shared/ui/badge/badge';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { TPipe } from '../../../shared/pipes/t.pipe';
import { UiBadge, UiButton, UiCard, UiSectionLabel } from '../../../shared/ui';

/** Null for the default, so only a notable status shows up on a copy row. */
const STATUS_KEYS: Record<CopyStatus, MessageKey | null> = {
  Keep: null,
  ForTrade: 'copyStatus.forTrade',
  ForSale: 'copyStatus.forSale',
};

@Component({
  selector: 'app-item-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MoneyPipe, TPipe, UiBadge, UiButton, UiCard, UiSectionLabel],
  templateUrl: './item-page.html',
  styleUrl: './item-page.scss',
  host: { '(document:keydown)': 'onKeydown($event)' },
})
export class ItemPage {
  protected readonly store = inject(VaultStore);
  protected readonly images = inject(ImagesApi);
  protected readonly focus = inject(ImageFocusService);
  private readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly collectionId = input.required<string>();
  readonly itemId = input.required<string>();
  /**
   * The list this item was opened from, as the grid had it: group, filters and
   * order, all off the URL because every item link preserves the query string.
   * Rebuilding it here is what lets the arrows step to the next item of *that*
   * list rather than to whatever happens to come next in the collection.
   */
  readonly g = input<string | undefined>(undefined);
  readonly cond = input<string | undefined>(undefined);
  readonly own = input<string | undefined>(undefined);
  readonly sort = input<string | undefined>(undefined);
  readonly dir = input<string | undefined>(undefined);

  protected readonly selectedPhoto = signal(0);

  /** Id alongside url: the id is what resolves the photo's framing. */
  protected readonly photos = computed(
    () => this.item()?.photoIds.map(id => ({ id, url: this.images.url(id)! })) ?? [],
  );

  protected readonly mainPhoto = computed(() => {
    const photos = this.photos();
    if (!photos.length) return null;
    return photos[Math.min(this.selectedPhoto(), photos.length - 1)];
  });

  protected readonly collection = computed(() => this.store.collection(this.collectionId()));
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
  }

  // --- browsing the group ---

  /** The list the grid was showing, rebuilt from the URL. */
  private readonly ordered = computed(() => {
    const collection = this.collection();
    if (!collection) return [];
    return visibleItems(
      collection.items,
      collection.groups,
      readCriteria(
        { cond: this.cond(), own: this.own(), sort: this.sort(), dir: this.dir() },
        this.g() ?? null,
        this.store.query(),
      ),
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
    const canonical = visibleItems(collection.items, collection.groups, {
      groupId: this.g() ?? null,
      ...NO_FILTERS,
    });
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
   * ← and → walk the group. They belong to the items, except while the focus is
   * inside the thumbnail strip, where the user has already said they mean
   * photos — and they never fire in a field that uses them to move a caret.
   */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;

    const back = event.key === 'ArrowLeft';

    if (target?.closest('.gallery__thumbs')) {
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

  protected readonly copyRows = computed(() => {
    const item = this.item();
    if (!item) return [];
    return item.copies.map(copy => ({
      ...copy,
      tone: conditionTone(copy.condition),
      conditionKey: conditionLabelKey(copy.condition),
      value: copyValue(item, copy),
      // Status is only worth showing when it is not the default.
      statusKey: STATUS_KEYS[copy.status],
      acquiredOnLabel: formatDate(copy.acquiredOn, this.i18n.locale()),
    }));
  });

  protected readonly copiesTotal = computed(() => {
    const item = this.item();
    if (!item) return '';
    const count = item.copies.length;
    return this.i18n.t(count === 1 ? 'item.copyTotal.one' : 'item.copyTotal.other', {
      n: count,
      paid: formatMoney(this.paidTotal(), this.i18n.locale()),
      value: formatMoney(this.ownedValue(), this.i18n.locale()),
    });
  });

  protected readonly tags = computed(
    () => this.item()?.tags.map(t => `#${t}`).join('  ') ?? '',
  );

  protected readonly groupPath = computed(() => {
    const collection = this.collection();
    const item = this.item();
    if (!collection || !item) return '';
    const path = pathOf(collection.groups, item.groupId).map(g => g.name);
    return path.length ? path.join(' / ') : item.groupId;
  });

  protected readonly groupFieldRows = computed(() => {
    const collection = this.collection();
    const item = this.item();
    if (!collection || !item) return [];
    return fieldsFor(collection.groups, item.groupId).map(field => ({
      key: field.name,
      value: item.custom.find(c => c.key === field.name)?.value || '—',
    }));
  });

  protected readonly groupName = computed(() => {
    const collection = this.collection();
    const item = this.item();
    if (!collection || !item) return '';
    return groupById(collection.groups, item.groupId)?.name ?? item.groupId;
  });

  protected addPhoto(): void {
    const item = this.item();
    if (!item) return;
    if (item.photoIds.length >= 8) {
      this.toast.flash(this.i18n.t('toast.photo.limit'));
      return;
    }
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'image/*';
    picker.onchange = async () => {
      const file = picker.files?.[0];
      if (!file) return;
      try {
        const imageId = await this.focus.uploadAndFrame(file, 'item');
        // Discarded in the editor: nothing is added to the item.
        if (!imageId) return;

        await this.store.upsertItem(this.collectionId(), {
          ...item,
          photoIds: [...item.photoIds, imageId],
        });
        this.selectedPhoto.set(item.photoIds.length);
        this.toast.flash(this.i18n.t('toast.photo.added'));
      } catch (err) {
        this.toast.flash(
          err instanceof Error ? err.message : this.i18n.t('toast.photo.uploadFailed'),
        );
      }
    };
    picker.click();
  }

  /** Reopens the editor for an existing photo — framing is never final. */
  protected reframe(imageId: string): void {
    void this.focus.frame(imageId, 'item');
  }

  protected async markOwned(): Promise<void> {
    const item = this.item();
    if (!item) return;
    // Owning something means having a copy of it — so add one.
    await this.store.upsertItem(
      this.collectionId(),
      syncWantedTag({ ...item, copies: [...item.copies, newCopy()] }),
    );
    this.toast.flash(this.i18n.t('toast.copy.added'));
  }

  protected async deleteItem(): Promise<void> {
    const item = this.item();
    if (!item) return;
    await this.store.deleteItem(this.collectionId(), item.id);
    this.toast.flash(this.i18n.t('toast.item.deleted'));
    void this.router.navigate(['/c', this.collectionId()], { queryParamsHandling: 'preserve' });
  }
}
