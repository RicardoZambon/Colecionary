import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { ImagesApi } from '../../../core/api/images-api';
import { ImageFocusService } from '../../../core/state/image-focus.service';
import { ToastService } from '../../../core/state/toast.service';
import { VaultStore } from '../../../core/state/vault.store';
import { CopyStatus } from '../../../core/models';
import { copyValue, isOwned, newCopy, ownedValue, paidTotal, syncWantedTag } from '../../../core/utils/copies.util';
import { fieldsFor, groupById, pathOf } from '../../../core/utils/groups.util';
import { conditionTone, itemBadgeLabel, itemTone } from '../../../shared/ui/badge/badge';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { UiBadge, UiButton, UiCard, UiSectionLabel } from '../../../shared/ui';

/** Empty for the default, so only a notable status shows up on a copy row. */
const STATUS_LABELS: Record<CopyStatus, string> = {
  Keep: '',
  ForTrade: 'FOR TRADE',
  ForSale: 'FOR SALE',
};

@Component({
  selector: 'app-item-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MoneyPipe, UiBadge, UiButton, UiCard, UiSectionLabel],
  templateUrl: './item-page.html',
  styleUrl: './item-page.scss',
})
export class ItemPage {
  protected readonly store = inject(VaultStore);
  protected readonly images = inject(ImagesApi);
  protected readonly focus = inject(ImageFocusService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly collectionId = input.required<string>();
  readonly itemId = input.required<string>();

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

  protected readonly tone = computed(() => {
    const item = this.item();
    return item ? itemTone(item) : 'neutral';
  });
  protected readonly badge = computed(() => {
    const item = this.item();
    return item ? itemBadgeLabel(item) : '';
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
      value: copyValue(item, copy),
      // Status is only worth showing when it is not the default.
      statusLabel: STATUS_LABELS[copy.status],
    }));
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
      this.toast.flash('Up to 8 photos per item');
      return;
    }
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'image/*';
    picker.onchange = async () => {
      const file = picker.files?.[0];
      if (!file) return;
      try {
        const imageId = await this.focus.uploadAndFrame(file);
        await this.store.upsertItem(this.collectionId(), {
          ...item,
          photoIds: [...item.photoIds, imageId],
        });
        this.selectedPhoto.set(item.photoIds.length);
        this.toast.flash('Photo added ✓');
      } catch (err) {
        this.toast.flash(err instanceof Error ? err.message : 'Upload failed');
      }
    };
    picker.click();
  }

  /** Reopens the editor for an existing photo — framing is never final. */
  protected reframe(imageId: string): void {
    void this.focus.frame(imageId);
  }

  protected async markOwned(): Promise<void> {
    const item = this.item();
    if (!item) return;
    // Owning something means having a copy of it — so add one.
    await this.store.upsertItem(
      this.collectionId(),
      syncWantedTag({ ...item, copies: [...item.copies, newCopy()] }),
    );
    this.toast.flash('Copy added ✓');
  }

  protected async deleteItem(): Promise<void> {
    const item = this.item();
    if (!item) return;
    await this.store.deleteItem(this.collectionId(), item.id);
    this.toast.flash('Item deleted');
    void this.router.navigate(['/c', this.collectionId()], { queryParamsHandling: 'preserve' });
  }
}
