import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

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
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly collectionId = input.required<string>();
  readonly itemId = input.required<string>();

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
