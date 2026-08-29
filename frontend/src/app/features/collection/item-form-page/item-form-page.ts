import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { ImagesApi } from '../../../core/api/images-api';
import { I18nService, MessageKey } from '../../../core/i18n';
import { ImageFocusService } from '../../../core/state/image-focus.service';
import { VaultConflictError } from '../../../core/api/vault-api';
import { ToastService } from '../../../core/state/toast.service';
import { VaultStore } from '../../../core/state/vault.store';
import { CONDITIONS, Condition, CopyStatus, GroupField, Item, ItemCopy } from '../../../core/models';
import { newCopy, syncWantedTag } from '../../../core/utils/copies.util';
import { fieldsFor, flattenTree, groupById, resolveGroupId } from '../../../core/utils/groups.util';
import { resolveSectionId, sectionsOf } from '../../../core/utils/sections.util';
import { groupLinkParams } from '../browse-params';
import { TPipe } from '../../../shared/pipes/t.pipe';
import {
  SelectOption,
  UiButton,
  UiCard,
  UiField,
  UiPhotoManager,
  UiSelect,
  UiTextInput,
  UiTextarea,
} from '../../../shared/ui';
import { conditionLabelKey } from '../../../shared/ui/badge/badge';

const COPY_STATUS_KEYS: { value: CopyStatus; label: MessageKey }[] = [
  { value: 'Keep', label: 'copyStatus.keep' },
  { value: 'ForTrade', label: 'copyStatus.forTrade' },
  { value: 'ForSale', label: 'copyStatus.forSale' },
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
  imports: [
    RouterLink,
    TPipe,
    UiButton,
    UiCard,
    UiField,
    UiPhotoManager,
    UiSelect,
    UiTextInput,
    UiTextarea,
  ],
  templateUrl: './item-form-page.html',
  styleUrl: './item-form-page.scss',
})
export class ItemFormPage {
  protected readonly store = inject(VaultStore);
  protected readonly images = inject(ImagesApi);
  protected readonly focus = inject(ImageFocusService);
  private readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly collectionId = input.required<string>();
  /** Present when editing, absent on the "new item" route. */
  readonly itemId = input<string | undefined>(undefined);
  /**
   * The group open in the collection behind this form, preserved from `?g=` by
   * every "add item" link. A new item lands in the group you were looking at —
   * without this the form would pick an arbitrary group and the item would
   * vanish from the view you created it in.
   */
  readonly g = input<string | undefined>(undefined);
  /**
   * The section open behind the form, carried by the same links as `?g=` — so
   * an item added while reading one divider lands under it instead of in the
   * leftovers you would then have to drag it out of.
   */
  readonly s = input<string | undefined>(undefined);

  // Options carry the *wire* value and a translated label — the enum itself is
  // both the SQL representation and the validator whitelist, so it never moves.
  protected readonly conditionOptions = computed<SelectOption[]>(() =>
    CONDITIONS.map(c => ({ value: c, label: this.i18n.t(conditionLabelKey(c)) })),
  );
  protected readonly copyStatusOptions = computed<SelectOption[]>(() =>
    COPY_STATUS_KEYS.map(s => ({ value: s.value, label: this.i18n.t(s.label) })),
  );

  protected readonly collection = computed(() => this.store.collection(this.collectionId()));
  protected readonly editing = computed(() =>
    this.collection()?.items.find(i => i.id === this.itemId()),
  );

  // Draft fields
  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly groupId = signal('');
  protected readonly sectionId = signal('');
  protected readonly year = signal('');
  protected readonly value = signal('');
  protected readonly copies = signal<CopyDraft[]>([]);
  protected readonly custom = signal<Record<string, string>>({});
  protected readonly photoIds = signal<string[]>([]);

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
      this.groupId.set(this.initialGroupId(item));
      this.sectionId.set(this.initialSectionId(item));
      this.year.set(item ? String(item.year) : '');
      // Blank, not "0": zero *is* "not estimated", and showing it as a figure
      // invites the user to keep a number they never entered.
      this.value.set(item?.value ? String(item.value) : '');
      // A new item starts with one copy — adding something you own is the
      // common case, and the old form defaulted to "Owned". Remove it to put
      // the item on the wantlist instead.
      this.copies.set(item ? item.copies.map(toDraft) : [toDraft(newCopy())]);
      this.custom.set(Object.fromEntries((item?.custom ?? []).map(c => [c.key, c.value])));
      this.photoIds.set([...(item?.photoIds ?? [])]);
    });
  }

  /**
   * Which group the form opens on: the item's own when editing, the one open
   * behind the form when adding. Both go through `resolveGroupId`, so a group
   * deleted since either was recorded opens as "no group" rather than as a
   * selection the picker can't show.
   */
  private initialGroupId(item: Item | undefined): string {
    return resolveGroupId(this.collection()?.groups ?? [], item ? item.groupId : this.g());
  }

  /**
   * The same story one level down, and resolved against the group the form
   * actually opened on: a section belongs to exactly one group, so a remembered
   * `?s=` from somewhere else, or one deleted since, opens as "no section".
   */
  private initialSectionId(item: Item | undefined): string {
    return resolveSectionId(
      this.collection()?.sections ?? [],
      this.groupId(),
      item ? item.sectionId : this.s(),
    );
  }

  protected readonly maxPhotos = MAX_PHOTOS;

  /**
   * The manager hands back the whole list after any edit — added, reordered,
   * made cover, removed — so the form has one way in rather than four.
   */
  protected setPhotos(ids: string[]): void {
    this.photoIds.set(ids);
  }

  /** Opens the framing editor for one photo. Cancelling changes nothing. */
  protected reframe(imageId: string): void {
    void this.focus.frame(imageId, 'item');
  }

  // --- copies ---

  protected addCopy(): void {
    if (this.copies().length >= MAX_COPIES) {
      this.toast.flash(this.i18n.t('toast.copy.limit', { n: MAX_COPIES }));
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

  // Leaving an item unfiled is a real choice, not the absence of one, so it is
  // an option like any other — and it is the one the form starts on when you
  // add from the collection root or from the unfiled bucket.
  protected readonly groupOptions = computed<SelectOption[]>(() => [
    { value: '', label: this.i18n.t('group.none') },
    ...flattenTree(this.collection()?.groups ?? []).map(({ node, depth }) => ({
      value: node.id,
      label: (depth ? '   '.repeat(depth) + '↳ ' : '') + node.name,
    })),
  ]);

  /**
   * The dividers of the chosen group, plus "no section".
   *
   * Empty of real options for a group that declares none, which is why the
   * whole field disappears rather than offering a picker with one entry: a
   * control whose only choice is "none" asks a question that has no answer.
   */
  protected readonly sectionOptions = computed<SelectOption[]>(() => {
    const sections = sectionsOf(this.collection()?.sections ?? [], this.groupId() || null);
    if (!sections.length) return [];
    return [
      { value: '', label: this.i18n.t('section.none') },
      ...sections.map(section => ({ value: section.id, label: section.name })),
    ];
  });

  protected readonly groupFields = computed(() =>
    fieldsFor(this.collection()?.groups ?? [], this.groupId() || null),
  );

  /** A declared field type maps straight onto the native input type. */
  protected inputType(field: GroupField): string {
    return field.type === 'text' ? 'text' : field.type;
  }

  /** Names the group-fields section — "no group" is a name too, not a blank. */
  protected readonly groupLabel = computed(() => {
    const collection = this.collection();
    if (!collection) return '';
    const name = groupById(collection.groups, this.groupId())?.name;
    return (name ?? this.i18n.t('group.none')).toUpperCase();
  });

  /**
   * Changing the group clears a section the new group does not have. Left
   * alone the value would still render as "no section" — the resolution rule
   * sees to that — but the form would be showing one thing and saving another,
   * and the difference would only surface later as an item nobody can find.
   */
  protected setGroupId(groupId: string): void {
    this.groupId.set(groupId);
    this.sectionId.set(
      resolveSectionId(this.collection()?.sections ?? [], groupId, this.sectionId()),
    );
  }

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
      this.toast.flash(this.i18n.t('toast.item.needsName'));
      return;
    }

    const existing = this.editing();

    const item: Item = {
      id: existing?.id ?? `i${Date.now()}`,
      name,
      description: this.description().trim(),
      groupId: this.groupId(),
      sectionId: this.sectionId(),
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

    try {
      await this.store.upsertItem(collection.id, syncWantedTag(item));
    } catch (err) {
      // The one thing that must not happen here is navigating away: this form
      // is the only copy of what was typed, and a refused save leaves it
      // unsaved. A conflict explains itself through the shell's notice; any
      // other failure gets a toast. Either way the page stays exactly as it is.
      if (!(err instanceof VaultConflictError)) {
        this.toast.flash(
          err instanceof Error ? err.message : this.i18n.t('toast.item.saveFailed'),
        );
      }
      return;
    }

    this.toast.flash(this.i18n.t('toast.item.saved'));

    if (existing) {
      void this.router.navigate(['/c', collection.id, 'items', existing.id], {
        queryParamsHandling: 'preserve',
      });
      return;
    }

    // Back to the collection open on the group the item actually went into.
    // Preserving `?g=` would return you to the view you started from, and if you
    // changed the group while filling the form that is the one view the new item
    // is not in. Null drops the param: an unfiled item shows at the root.
    void this.router.navigate(['/c', collection.id], {
      queryParams: groupLinkParams(item.groupId || null),
      queryParamsHandling: 'merge',
    });
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
