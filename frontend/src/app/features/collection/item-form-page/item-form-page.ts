import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { ToastService } from '../../../core/state/toast.service';
import { VaultStore } from '../../../core/state/vault.store';
import { Condition, Item } from '../../../core/models';
import { fieldsFor, flattenTree, groupById } from '../../../core/utils/groups.util';
import { SelectOption, UiButton, UiCard, UiField, UiSelect, UiTextInput, UiTextarea } from '../../../shared/ui';

const CONDITION_OPTIONS: SelectOption[] = [
  { value: 'Mint', label: 'Mint' },
  { value: 'Good', label: 'Good' },
  { value: 'Fair', label: 'Fair' },
];

const STATUS_OPTIONS: SelectOption[] = [
  { value: 'Owned', label: 'Owned — in my vault' },
  { value: 'Wanted', label: 'Wanted — on the hunt' },
];

@Component({
  selector: 'app-item-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, UiButton, UiCard, UiField, UiSelect, UiTextInput, UiTextarea],
  templateUrl: './item-form-page.html',
  styleUrl: './item-form-page.scss',
})
export class ItemFormPage {
  protected readonly store = inject(VaultStore);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly collectionId = input.required<string>();
  /** Present when editing, absent on the "new item" route. */
  readonly itemId = input<string | undefined>(undefined);

  protected readonly conditionOptions = CONDITION_OPTIONS;
  protected readonly statusOptions = STATUS_OPTIONS;

  protected readonly collection = computed(() => this.store.collection(this.collectionId()));
  protected readonly editing = computed(() =>
    this.collection()?.items.find(i => i.id === this.itemId()),
  );

  // Draft fields
  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly groupId = signal('');
  protected readonly condition = signal<string>('Good');
  protected readonly status = signal<string>('Owned');
  protected readonly year = signal('');
  protected readonly price = signal('');
  protected readonly value = signal('');
  protected readonly custom = signal<Record<string, string>>({});

  private initializedFor: string | null = null;

  constructor() {
    effect(() => {
      const collection = this.collection();
      if (!collection) return;
      const key = `${this.collectionId()}::${this.itemId() ?? 'new'}`;
      if (this.initializedFor === key) return;
      this.initializedFor = key;

      const item = this.editing();
      this.name.set(item?.name ?? '');
      this.description.set(item?.description ?? '');
      this.groupId.set(item?.groupId ?? collection.groups[0]?.id ?? '');
      this.condition.set(item?.condition ?? 'Good');
      this.status.set(item && !item.owned ? 'Wanted' : 'Owned');
      this.year.set(item ? String(item.year) : '');
      this.price.set(item ? String(item.price) : '');
      this.value.set(item ? String(item.value) : '');
      this.custom.set(Object.fromEntries((item?.custom ?? []).map(c => [c.key, c.value])));
    });
  }

  protected readonly groupOptions = computed<SelectOption[]>(() =>
    flattenTree(this.collection()?.groups ?? []).map(({ node, depth }) => ({
      value: node.id,
      label: (depth ? '   '.repeat(depth) + '↳ ' : '') + node.name,
    })),
  );

  protected readonly groupFieldNames = computed(() =>
    fieldsFor(this.collection()?.groups ?? [], this.groupId() || null),
  );

  protected readonly groupLabel = computed(() => {
    const collection = this.collection();
    if (!collection) return '';
    return groupById(collection.groups, this.groupId())?.name?.toUpperCase() ?? '';
  });

  protected customValue(field: string): string {
    return this.custom()[field] ?? '';
  }

  protected setCustomValue(field: string, value: string): void {
    this.custom.update(all => ({ ...all, [field]: value }));
  }

  protected async save(): Promise<void> {
    const collection = this.collection();
    if (!collection) return;
    const name = this.name().trim();
    if (!name) {
      this.toast.flash('Give the item a name');
      return;
    }

    const existing = this.editing();
    const owned = this.status() !== 'Wanted';
    const tags = new Set(existing?.tags ?? []);
    if (owned) tags.delete('wanted');
    else tags.add('wanted');

    const item: Item = {
      id: existing?.id ?? `i${Date.now()}`,
      name,
      description: this.description().trim(),
      groupId: this.groupId(),
      condition: (this.condition() as Condition) || 'Good',
      year: parseNumber(this.year()) || new Date().getFullYear(),
      price: parseNumber(this.price()),
      value: parseNumber(this.value()),
      owned,
      tags: [...tags],
      img: existing?.img ?? slugify(name) + '.jpg',
      custom: this.groupFieldNames()
        .map(key => ({ key, value: (this.custom()[key] ?? '').trim() }))
        .filter(c => c.value),
    };

    await this.store.upsertItem(collection.id, item);
    this.toast.flash('Saved ✓');
    void this.router.navigate(
      existing ? ['/c', collection.id, 'items', existing.id] : ['/c', collection.id],
      { queryParamsHandling: 'preserve' },
    );
  }

  protected cancel(): void {
    const existing = this.editing();
    void this.router.navigate(
      existing
        ? ['/c', this.collectionId(), 'items', existing.id]
        : ['/c', this.collectionId()],
      { queryParamsHandling: 'preserve' },
    );
  }
}

function parseNumber(raw: string): number {
  const parsed = parseFloat(raw.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
