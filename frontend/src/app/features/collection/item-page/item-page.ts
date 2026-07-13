import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { ImagesApi } from '../../../core/api/images-api';
import { ToastService } from '../../../core/state/toast.service';
import { VaultStore } from '../../../core/state/vault.store';
import { fieldsFor, groupById, pathOf } from '../../../core/utils/groups.util';
import { conditionLabel, conditionTone } from '../../../shared/ui/badge/badge';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { UiBadge, UiButton, UiCard, UiSectionLabel } from '../../../shared/ui';

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
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly collectionId = input.required<string>();
  readonly itemId = input.required<string>();

  protected readonly selectedPhoto = signal(0);

  protected readonly photoUrls = computed(
    () => this.item()?.photoIds.map(id => this.images.url(id)!) ?? [],
  );

  protected readonly mainPhotoUrl = computed(() => {
    const urls = this.photoUrls();
    if (!urls.length) return null;
    return urls[Math.min(this.selectedPhoto(), urls.length - 1)];
  });

  protected readonly collection = computed(() => this.store.collection(this.collectionId()));
  protected readonly item = computed(() =>
    this.collection()?.items.find(i => i.id === this.itemId()),
  );

  protected readonly tone = computed(() => {
    const item = this.item();
    return item ? conditionTone(item.condition, item.owned) : 'neutral';
  });
  protected readonly badge = computed(() => {
    const item = this.item();
    return item ? conditionLabel(item.condition, item.owned) : '';
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
    return fieldsFor(collection.groups, item.groupId).map(name => ({
      key: name,
      value: item.custom.find(c => c.key === name)?.value || '—',
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
        const imageId = await this.images.upload(file);
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

  protected async markOwned(): Promise<void> {
    const item = this.item();
    if (!item) return;
    await this.store.upsertItem(this.collectionId(), {
      ...item,
      owned: true,
      tags: item.tags.filter(t => t !== 'wanted'),
    });
    this.toast.flash('Marked as owned ✓');
  }

  protected async deleteItem(): Promise<void> {
    const item = this.item();
    if (!item) return;
    await this.store.deleteItem(this.collectionId(), item.id);
    this.toast.flash('Item deleted');
    void this.router.navigate(['/c', this.collectionId()], { queryParamsHandling: 'preserve' });
  }
}
