import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { ImagesApi } from '../../../core/api/images-api';
import { I18nService, MessageKey } from '../../../core/i18n';
import { ImageFocusService } from '../../../core/state/image-focus.service';
import { isReportedWriteFailure } from '../../../core/api/vault-api';
import { ConfirmService } from '../../../core/state/confirm.service';
import { ToastService } from '../../../core/state/toast.service';
import { VaultStore } from '../../../core/state/vault.store';
import { CONDITIONS, Condition, CopyStatus, GroupField, Item, ItemCopy } from '../../../core/models';
import { CurrencyService } from '../../../core/state/currency.service';
import { isOwned, newCopy, ownedValue, paidTotal, syncWantedTag } from '../../../core/utils/copies.util';
import { tagsInUse } from '../../../core/utils/tags.util';
import { currencyOf } from '../../../core/utils/currency.util';
import {
  copyFields,
  fieldsFor,
  flattenTree,
  groupById,
  itemFields,
  resolveGroupId,
} from '../../../core/utils/groups.util';
import { resolveSectionId, sectionsOf } from '../../../core/utils/sections.util';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { groupLinkParams } from '../browse-params';
import { TPipe } from '../../../shared/pipes/t.pipe';
import {
  SelectOption,
  UiButton,
  UiCard,
  UiDateInput,
  UiField,
  UiIcon,
  UiPhotoManager,
  UiSelect,
  UiSkeleton,
  UiTagInput,
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
  /**
   * Values for the copy-scoped fields, by field name. A plain record for the
   * same reason the item's own `custom` is one: the form edits by name, and the
   * ordered key/value list is what the *model* wants, not what an input wants.
   */
  custom: Record<string, string>;
}

/**
 * Whether a copy draft holds anything a person typed.
 *
 * `condition` and `status` are excluded on purpose: every new copy arrives with
 * both already set, so counting them would make an untouched blank copy look
 * like it had content and put a pointless question in front of every removal.
 */
function copyDraftHasContent(copy: CopyDraft): boolean {
  // The numbers are parsed, not tested as strings. `newCopy()` starts at
  // `price: 0` and `toDraft` stringifies that to "0", so reading the raw string
  // made every freshly added copy look like it held data — which would have put
  // a question in front of every single removal and taught people to dismiss it
  // without reading. Zero is "not set" here, exactly as it is for an item's
  // estimate; the cost is that a copy whose only fact is "paid nothing" is
  // removed without asking.
  return Boolean(
    parseNumber(copy.value) ||
      parseNumber(copy.price) ||
      copy.acquiredOn.trim() ||
      copy.notes.trim() ||
      // A copy whose only fact is its serial number still holds something a
      // person typed, and that is exactly the copy whose removal must ask.
      Object.values(copy.custom).some(value => value.trim()),
  );
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
    custom: Object.fromEntries(copy.custom.map(entry => [entry.key, entry.value])),
  };
}

/**
 * `fields` are the copy-scoped fields currently declared, and only those are
 * written back — the same bargain the item's own `custom` makes in `draftItem`.
 * A value whose field this group does not declare is dropped, which is
 * defensible here and nowhere else: the person is looking at this copy's whole
 * field set as they save it. A bulk apply must keep them (rule 14).
 */
function fromDraft(draft: CopyDraft, fields: readonly GroupField[]): ItemCopy {
  return {
    id: draft.id,
    condition: draft.condition,
    price: parseNumber(draft.price),
    value: draft.value.trim() ? parseNumber(draft.value) : null,
    acquiredOn: draft.acquiredOn.trim() || null,
    status: draft.status,
    notes: draft.notes.trim(),
    custom: fields
      .map(field => ({ key: field.name, value: (draft.custom[field.name] ?? '').trim() }))
      .filter(entry => entry.value),
  };
}

@Component({
  selector: 'app-item-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MoneyPipe,
    RouterLink,
    TPipe,
    UiButton,
    UiCard,
    UiDateInput,
    UiField,
    UiIcon,
    UiPhotoManager,
    UiSelect,
    UiSkeleton,
    UiTagInput,
    UiTextInput,
    UiTextarea,
  ],
  templateUrl: './item-form-page.html',
  styleUrl: './item-form-page.scss',
})
export class ItemFormPage {
  protected readonly store = inject(VaultStore);

  /** The vault is still in flight — not the same fact as 'no such collection'. */
  protected readonly loading = computed(() => !this.store.loaded());
  protected readonly images = inject(ImagesApi);
  protected readonly focus = inject(ImageFocusService);
  private readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);
  private readonly currencies = inject(CurrencyService);
  private readonly document = inject(DOCUMENT);

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

  /**
   * Whether this collection already has a write in flight, so Save can stop
   * offering itself. An item write is guarded by the *collection's* version, so
   * a second one sent before the first answers quotes a token that is about to
   * move and is refused — as a conflict with nobody.
   */
  protected readonly saving = computed(() => this.store.saving(this.collectionId()));
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
  /**
   * The item's whole tag list, the derived `wanted` one included.
   *
   * Kept whole rather than pre-filtered because `syncWantedTag` runs over the
   * saved item and expects to find it: dropping it here would make every save
   * from this form look like the item had left the wantlist.
   */
  protected readonly tags = signal<readonly string[]>([]);

  /**
   * The draft as it stood when the form opened, or when it was last saved.
   *
   * Dirtiness is a comparison against a snapshot rather than a flag set by every
   * handler: a flag has to be set in ten places and is wrong the first time
   * someone adds an eleventh, and it also cannot tell that a user typed a
   * character and deleted it again. Serialising is cheap — this is a form, not a
   * list — and it is exact.
   */
  private readonly baseline = signal('');

  protected readonly snapshot = computed(() =>
    JSON.stringify({
      name: this.name().trim(),
      description: this.description().trim(),
      groupId: this.groupId(),
      sectionId: this.sectionId(),
      year: this.year().trim(),
      value: this.value().trim(),
      copies: this.copies().map(copy => fromDraft(copy, this.copyFieldDefs())),
      custom: this.custom(),
      photoIds: this.photoIds(),
    }),
  );

  protected readonly dirty = computed(() => this.snapshot() !== this.baseline());

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
      this.tags.set([...(item?.tags ?? [])]);
      // Seeded after every field, so an untouched form is clean. Read through
      // `untracked` is unnecessary here: the effect already depends on all of
      // them by having just written them.
      this.baseline.set(this.snapshot());
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
   *
   * A shorter list is the only one of those four that loses something: putting
   * a photo back means finding the file and uploading it again, because the
   * bytes survive their grace period but nothing in the app offers them back.
   * So the question is asked on the shrink and on nothing else — a reorder that
   * stopped to ask would be a confirmation people learn to dismiss.
   */
  protected async setPhotos(ids: string[]): Promise<void> {
    if (ids.length < this.photoIds().length) {
      const confirmed = await this.confirm.ask({
        titleKey: 'confirm.removePhoto.title',
        bodyKey: 'confirm.removePhoto.body',
        confirmKey: 'confirm.removePhoto.confirm',
        tone: 'danger',
      });
      if (!confirmed) return;
    }
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

  /**
   * Removes one copy, asking first if there is anything in it to lose.
   *
   * A copy is a physical object with a price paid, a condition, a date and
   * notes, and none of that is recoverable from anywhere else — so a mis-click
   * on the wrong row of a list of identical-looking copies is expensive. But an
   * untouched blank copy, which is what "add copy" gives you, holds nothing:
   * asking about that one would teach people to dismiss the question without
   * reading it, which is how a confirmation stops working.
   *
   * Removing the last copy is also how an item goes on the wantlist, and that
   * is a deliberate act worth naming rather than a side effect.
   */
  protected async removeCopy(index: number): Promise<void> {
    const copy = this.copies()[index];
    if (!copy) return;

    if (copyDraftHasContent(copy)) {
      const last = this.copies().length === 1;
      const confirmed = await this.confirm.ask({
        titleKey: 'confirm.removeCopy.title',
        bodyKey: last ? 'confirm.removeCopy.bodyLast' : 'confirm.removeCopy.body',
        confirmKey: 'confirm.removeCopy.confirm',
        tone: 'danger',
      });
      if (!confirmed) return;
    }

    this.copies.update(copies => copies.filter((_, i) => i !== index));
  }


  protected patchCopy(index: number, patch: Partial<CopyDraft>): void {
    this.copies.update(copies => copies.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  protected copyFieldValue(index: number, field: string): string {
    return this.copies()[index]?.custom[field] ?? '';
  }

  /** Goes through `patchCopy`, so one copy's edit can never rewrite another's. */
  protected setCopyFieldValue(index: number, field: string, value: string): void {
    const current = this.copies()[index];
    if (!current) return;
    this.patchCopy(index, { custom: { ...current.custom, [field]: value } });
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

  /** The whole set in force for the chosen group — both scopes, merged once. */
  private readonly declaredFields = computed(() => {
    const collection = this.collection();
    return collection ? fieldsFor(collection, this.groupId() || null) : [];
  });

  /** Edited once, on the item. */
  protected readonly groupFields = computed(() => itemFields(this.declaredFields()));

  /**
   * Edited once per copy. Empty is the normal case, and the copy editor draws
   * nothing at all then — a heading over no inputs would suggest a setting had
   * gone missing.
   */
  protected readonly copyFieldDefs = computed(() => copyFields(this.declaredFields()));

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


  // --- the summary card ---------------------------------------------------
  //
  // The left column used to be a 300px dropzone above ~600px of nothing, on a
  // page one click from anywhere. What belongs in that space is the answer to
  // the question the form is asking — "what am I about to save?" — read from the
  // same helpers every other surface reads, so the figure here and the figure on
  // the item page cannot disagree.

  /** The item this form would save right now. Also what `save()` sends. */
  protected readonly draftItem = computed<Item>(() => {
    const existing = this.editing();
    return {
      id: existing?.id ?? '',
      name: this.name().trim(),
      description: this.description().trim(),
      groupId: this.groupId(),
      sectionId: this.sectionId(),
      year: parseNumber(this.year()) || new Date().getFullYear(),
      value: parseNumber(this.value()),
      copies: this.copies().map(copy => fromDraft(copy, this.copyFieldDefs())),
      tags: [...this.tags()],
      img: existing?.img ?? slugify(this.name().trim()) + '.jpg',
      photoIds: this.photoIds(),
      createdAt: existing?.createdAt,
      custom: this.groupFields()
        .map(field => ({ key: field.name, value: (this.custom()[field.name] ?? '').trim() }))
        .filter(c => c.value),
    };
  });

  /**
   * Tags already used elsewhere in this collection, offered as completions.
   *
   * A vocabulary that grows one typo at a time is one nobody can filter by, and
   * the cheapest guard against that is showing people the words they have
   * already chosen.
   */
  protected readonly tagSuggestions = computed(() => tagsInUse(this.collection()?.items ?? []));

  protected readonly currency = computed(() =>
    currencyOf(this.collection(), this.currencies.account()),
  );

  protected readonly owned = computed(() => isOwned(this.draftItem()));
  protected readonly paid = computed(() => paidTotal(this.draftItem()));
  protected readonly estimate = computed(() => ownedValue(this.draftItem()));

  /** Where the item will be filed, spelled out — "no group" is an answer too. */
  protected readonly destination = computed(() => {
    const collection = this.collection();
    if (!collection) return '';
    const group = groupById(collection.groups, this.groupId())?.name ?? this.i18n.t('group.none');
    const section = collection.sections.find(sec => sec.id === this.sectionId())?.name;
    return section ? `${group} \u25B8 ${section}` : group;
  });

  protected async save(): Promise<void> {
    const collection = this.collection();
    if (!collection) return;
    const name = this.name().trim();
    if (!name) {
      this.toast.flash(this.i18n.t('toast.item.needsName'));
      return;
    }

    const existing = this.editing();
    const item: Item = { ...this.draftItem(), id: existing?.id ?? `i${Date.now()}` };

    try {
      await this.store.upsertItem(collection.id, syncWantedTag(item));
    } catch (err) {
      // The one thing that must not happen here is navigating away: this form
      // is the only copy of what was typed, and a refused save leaves it
      // unsaved. A conflict explains itself through the shell's notice; any
      // other failure gets a toast. Either way the page stays exactly as it is.
      if (!isReportedWriteFailure(err)) {
        this.toast.flash(
          err instanceof Error ? err.message : this.i18n.t('toast.item.saveFailed'),
        );
      }
      return;
    }

    this.toast.flash(this.i18n.t('toast.item.saved'));
    // The form is now identical to what is stored, so the leave guard has
    // nothing to warn about — without this every successful save would be
    // followed by "you have unsaved changes" on its own navigation.
    this.baseline.set(this.snapshot());

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

  /**
   * The leave guard's answer. Public because the route calls it, not the
   * template.
   *
   * A native `confirm` rather than `ui-dialog`: a `CanDeactivate` has to answer
   * synchronously or hand back an Observable, and the dialog route means holding
   * a half-finished navigation in component state while a modal is open — a
   * state machine guarding a page whose whole job is to not lose data. The
   * browser's own dialog cannot be dismissed by a rogue re-render and needs no
   * state at all.
   */
  canLeave(): boolean {
    if (!this.dirty()) return true;
    const confirmed = this.document.defaultView?.confirm(this.i18n.t('itemForm.leaveConfirm'));
    return confirmed !== false;
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
