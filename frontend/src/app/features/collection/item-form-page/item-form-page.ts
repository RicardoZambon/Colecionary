import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { ImagesApi } from '../../../core/api/images-api';
import { ImageFocusService } from '../../../core/state/image-focus.service';
import { ToastService } from '../../../core/state/toast.service';
import { VaultStore } from '../../../core/state/vault.store';
import { CONDITIONS, Condition, CopyStatus, GroupField, Item, ItemCopy } from '../../../core/models';
import { newCopy, syncWantedTag } from '../../../core/utils/copies.util';
import { fieldsFor, flattenTree, groupById } from '../../../core/utils/groups.util';
import { SelectOption, UiButton, UiCard, UiField, UiSelect, UiTextInput, UiTextarea } from '../../../shared/ui';

const CONDITION_OPTIONS: SelectOption[] = CONDITIONS.map(c => ({ value: c, label: c }));

const COPY_STATUS_OPTIONS: SelectOption[] = [
  { value: 'Keep', label: 'Keeping' },
  { value: 'ForTrade', label: 'For trade' },
  { value: 'ForSale', label: 'For sale' },
];

const MAX_PHOTOS = 8;
const MAX_COPIES = 50;

/**
 * Money and dates stay as raw text while editing — parsing on every keystroke
 * would swallow the decimal point as you type it. Converted on save, like the
 * rest of this form.
 */
interface CopyDraft {
  id: string;
  condition: Condition;
  /** Empty means "inherit the item's estimate" and round-trips as null. */
  value: string;
  price: string;
  acquiredOn: string;
  status: CopyStatus;
  notes: string;
}

function toDraft(copy: ItemCopy): CopyDraft {
  return {
    id: copy.id,
    condition: copy.condition,
    price: String(copy.price),
    value: copy.value === null ? '' : String(copy.value),
    acquiredOn: copy.acquiredOn ?? '',
    status: copy.status,
    notes: copy.notes,
  };
}

function fromDraft(draft: CopyDraft): ItemCopy {
  return {
    id: draft.id,
    condition: draft.condition,
    price: parseNumber(draft.price),
    value: draft.value.trim() ? parseNumber(draft.value) : null,
    acquiredOn: draft.acquiredOn.trim() || null,
    status: draft.status,
    notes: draft.notes.trim(),
  };
}

@Component({
  selector: 'app-item-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, UiButton, UiCard, UiField, UiSelect, UiTextInput, UiTextarea],
  templateUrl: './item-form-page.html',
  styleUrl: './item-form-page.scss',
})
export class ItemFormPage {
  protected readonly store = inject(VaultStore);
  protected readonly images = inject(ImagesApi);
  protected readonly focus = inject(ImageFocusService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly collectionId = input.required<string>();
  /** Present when editing, absent on the "new item" route. */
  readonly itemId = input<string | undefined>(undefined);

  protected readonly conditionOptions = CONDITION_OPTIONS;
  protected readonly copyStatusOptions = COPY_STATUS_OPTIONS;

  protected readonly collection = computed(() => this.store.collection(this.collectionId()));
  protected readonly editing = computed(() =>
    this.collection()?.items.find(i => i.id === this.itemId()),
  );

  // Draft fields
  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly groupId = signal('');
  protected readonly year = signal('');
  protected readonly value = signal('');
  protected readonly copies = signal<CopyDraft[]>([]);
  protected readonly custom = signal<Record<string, string>>({});
  protected readonly photoIds = signal<string[]>([]);
  protected readonly uploading = signal(false);

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
      this.year.set(item ? String(item.year) : '');
      this.value.set(item ? String(item.value) : '');
      // A new item starts with one copy — adding something you own is the
      // common case, and the old form defaulted to "Owned". Remove it to put
      // the item on the wantlist instead.
      this.copies.set(item ? item.copies.map(toDraft) : [toDraft(newCopy())]);
      this.custom.set(Object.fromEntries((item?.custom ?? []).map(c => [c.key, c.value])));
      this.photoIds.set([...(item?.photoIds ?? [])]);
    });
  }

  protected browsePhotos(): void {
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'image/*';
    picker.multiple = true;
    picker.onchange = () => void this.addPhotos([...(picker.files ?? [])]);
    picker.click();
  }

  protected onPhotoDrop(event: DragEvent): void {
    event.preventDefault();
    void this.addPhotos([...(event.dataTransfer?.files ?? [])]);
  }

  protected async addPhotos(files: File[]): Promise<void> {
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (!imageFiles.length) return;
    this.uploading.set(true);
    try {
      for (const [index, file] of imageFiles.entries()) {
        if (this.photoIds().length >= MAX_PHOTOS) {
          this.toast.flash('Up to 8 photos per item');
          break;
        }
        // Only the first of a batch opens the editor: five modals in a row for
        // one drop would be hostile. The rest land centred and can be adjusted
        // from the grid whenever the user wants.
        const imageId =
          index === 0
            ? await this.focus.uploadAndFrame(file, 'item')
            : await this.images.upload(file);
        // Discarded in the editor: skip this one, but a batch's remaining
        // photos were still picked deliberately, so they carry on.
        if (!imageId) continue;

        this.photoIds.update(ids => [...ids, imageId]);
      }
    } catch (err) {
      this.toast.flash(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      this.uploading.set(false);
    }
  }

  protected removePhoto(index: number): void {
    this.photoIds.update(ids => ids.filter((_, i) => i !== index));
  }

  /** Reopens the editor for a photo already on the item. */
  protected reframe(imageId: string): void {
    void this.focus.frame(imageId, 'item');
  }

  // --- copies ---

  protected addCopy(): void {
    if (this.copies().length >= MAX_COPIES) {
      this.toast.flash(`Up to ${MAX_COPIES} copies per item`);
      return;
    }
    this.copies.update(copies => [...copies, toDraft(newCopy())]);
  }

  protected removeCopy(index: number): void {
    this.copies.update(copies => copies.filter((_, i) => i !== index));
  }

  protected patchCopy(index: number, patch: Partial<CopyDraft>): void {
    this.copies.update(copies => copies.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  protected readonly groupOptions = computed<SelectOption[]>(() =>
    flattenTree(this.collection()?.groups ?? []).map(({ node, depth }) => ({
      value: node.id,
      label: (depth ? '   '.repeat(depth) + '↳ ' : '') + node.name,
    })),
  );

  protected readonly groupFields = computed(() =>
    fieldsFor(this.collection()?.groups ?? [], this.groupId() || null),
  );

  /** A declared field type maps straight onto the native input type. */
  protected inputType(field: GroupField): string {
    return field.type === 'text' ? 'text' : field.type;
  }

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

    const item: Item = {
      id: existing?.id ?? `i${Date.now()}`,
      name,
      description: this.description().trim(),
      groupId: this.groupId(),
      year: parseNumber(this.year()) || new Date().getFullYear(),
      value: parseNumber(this.value()),
      copies: this.copies().map(fromDraft),
      tags: [...(existing?.tags ?? [])],
      img: existing?.img ?? slugify(name) + '.jpg',
      photoIds: this.photoIds(),
      createdAt: existing?.createdAt,
      custom: this.groupFields()
        .map(field => ({ key: field.name, value: (this.custom()[field.name] ?? '').trim() }))
        .filter(c => c.value),
    };

    await this.store.upsertItem(collection.id, syncWantedTag(item));
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
