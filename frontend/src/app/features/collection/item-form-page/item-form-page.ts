import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  Injector,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
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
import { PhotoUploadService } from '../../../core/state/photo-upload.service';
import { isOwned, newCopy, ownedValue, paidTotal, syncWantedTag } from '../../../core/utils/copies.util';
import { tagsInUse } from '../../../core/utils/tags.util';
import { currencyOf } from '../../../core/utils/currency.util';
import { formatMoney, parseAmount } from '../../../core/utils/money.util';
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
  UiSectionLabel,
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
    parseAmount(copy.value) ||
      parseAmount(copy.price) ||
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
    price: parseAmount(draft.price),
    value: draft.value.trim() ? parseAmount(draft.value) : null,
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
    UiSectionLabel,
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
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);
  /**
   * The shared upload queue, read for one fact: whether bytes are still in
   * flight. `UiPhotoManager` appends the ids it gets *after* awaiting the
   * queue, so a save that lands first sends `photoIds` as it was and the
   * remaining uploads finish into a destroyed component.
   */
  private readonly uploads = inject(PhotoUploadService);

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

  /**
   * Photos are still going up, so Save must not commit a `photoIds` that is
   * about to grow. `PhotoUploadService.busy` was documented as the thing pages
   * disable Save on and had no caller anywhere: dropping six photos and
   * pressing Save saved the item with one of them, or none.
   */
  protected readonly uploadsBusy = computed(() => this.uploads.busy());
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
      // Every draft signal belongs here, and this list is what `dirty()` means
      // by "changed". `tags` was missing, so three tags typed into the field
      // left `dirty()` false, the sticky bar silent and the leave guard
      // agreeing that there was nothing to lose. The spec walks the signals one
      // at a time for exactly that reason.
      tags: [...this.tags()],
    }),
  );

  protected readonly dirty = computed(() => this.snapshot() !== this.baseline());

  /**
   * Anything a navigation would destroy — typed edits *or* uploads whose ids
   * this form has not received yet. With only uploads pending the snapshot is
   * still identical to the baseline, so without this the guard would not even
   * ask.
   */
  protected readonly unsaved = computed(() => this.dirty() || this.uploadsBusy());

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

    // The in-app guard cannot see Cmd-R, a closed tab or a link out of the SPA,
    // and those are exactly the gestures people make when a page looks stuck.
    // Only the platform's own prompt can stop them — it cannot be styled or
    // worded, which is why the in-app dialog exists as well rather than
    // instead. Attached only while something would actually be lost: a
    // permanent listener makes every reload of a clean form ask.
    effect(onCleanup => {
      if (!this.unsaved()) return;
      const view = this.document.defaultView;
      if (!view) return;
      const warn = (event: BeforeUnloadEvent) => event.preventDefault();
      view.addEventListener('beforeunload', warn);
      onCleanup(() => view.removeEventListener('beforeunload', warn));
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
    const draft = toDraft(newCopy());
    this.copies.update(copies => [...copies, draft]);
    // Five inputs appear ~220px down the page and push the button that revealed
    // them out from under the pointer. Focusing the new row's first field says
    // where the reveal went, and stops the next click landing on shifted
    // content. Keyed by the draft's own id, never by index: a re-render between
    // the update and the render would otherwise focus somebody else's row.
    this.focusIn(`[data-copy-id="${draft.id}"] .copies__fields input`);
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
        // The ordinal, the condition and the price paid, because the list the
        // user would check against is behind the dialog and six copies of one
        // card are six identical blocks. `params` substitutes into the title
        // and the body alike.
        titleKey: 'confirm.removeCopy.titleAt',
        bodyKey: last ? 'confirm.removeCopy.bodyLastAt' : 'confirm.removeCopy.bodyAt',
        params: {
          n: index + 1,
          condition: this.i18n.t(conditionLabelKey(copy.condition)),
          paid: formatMoney(parseAmount(copy.price), this.i18n.locale(), this.currency()),
        },
        confirmKey: 'confirm.removeCopy.confirm',
        tone: 'danger',
      });
      if (!confirmed) return;
    }

    const survivors = this.copies().filter((_, i) => i !== index);
    this.copies.set(survivors);
    // The focused button has just been detached, and the browser falls back to
    // <body> — so cleaning up three copies by keyboard means three full
    // traversals of the page. Focus the neighbour that took its place, or the
    // "add copy" button when the list empties.
    const neighbour = survivors[Math.min(index, survivors.length - 1)];
    this.focusIn(
      neighbour
        ? `[data-copy-id="${neighbour.id}"] .copies__row-head button`
        : '.copies__actions button',
    );
  }

  /**
   * Moves focus to one element once the DOM has caught up with the signal.
   *
   * `afterNextRender` rather than a microtask: the element being focused does
   * not exist until Angular has re-rendered the list. A miss is silent on
   * purpose — a control that moved is not worth an exception on a form whose
   * whole job is not to lose data.
   */
  private focusIn(selector: string): void {
    afterNextRender(
      () => {
        const host = this.host.nativeElement as HTMLElement;
        host.querySelector<HTMLElement>(selector)?.focus();
      },
      { injector: this.injector },
    );
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

  /**
   * A `date` field takes `ui-date-input`, never a native date box.
   *
   * The reason is the one spelled out over the copy's own "Acquired" field: a
   * bare type="date" follows the *browser's* locale and shows mm/dd/yyyy inside
   * a Portuguese UI, which does not fail — it records the wrong date, and the
   * item page then prints it back in the document locale, so the form and the
   * detail page disagree about the same field.
   */
  protected isDate(field: GroupField): boolean {
    return field.type === 'date';
  }

  /** The remaining two types, which a text box can carry honestly. */
  protected inputType(field: GroupField): string {
    return field.type === 'number' ? 'number' : 'text';
  }

  /**
   * Names the fields card by **provenance**, not by position.
   *
   * The collection is the outermost ancestor in `fieldsFor` (rule 22), so a
   * field declared on the collection is in force in every group — and calling
   * the card "Group fields · NO GROUP" told the reader their declaration had
   * landed somewhere it had not. The group's name is used only when a group on
   * this item's path actually declares one of the fields shown.
   */
  protected readonly declaredFieldsLabel = computed(() => {
    const collection = this.collection();
    if (!collection) return '';
    const fromGroup = fieldsFor({ fields: [], groups: collection.groups }, this.groupId() || null);
    if (fromGroup.length) {
      const name = groupById(collection.groups, this.groupId())?.name;
      return (name ?? this.i18n.t('group.none')).toUpperCase();
    }
    return this.i18n.t('itemForm.collectionFieldsName').toUpperCase();
  });

  /**
   * The card has no item-scoped inputs but something *does* declare fields —
   * they are simply edited on each copy. Without this the card said "this group
   * has no custom fields yet" while the field was on screen twelve lines above,
   * inside every copy, which sends the user back to settings to check a
   * declaration that saved perfectly.
   */
  protected readonly onlyCopyFields = computed(
    () => !this.groupFields().length && this.copyFieldDefs().length > 0,
  );

  /**
   * Changing the group clears a section the new group does not have. Left
   * alone the value would still render as "no section" — the resolution rule
   * sees to that — but the form would be showing one thing and saving another,
   * and the difference would only surface later as an item nobody can find.
   */
  protected setGroupId(groupId: string): void {
    const had = this.sectionId();
    const hadOptions = this.sectionOptions().length > 0;
    this.groupId.set(groupId);
    const kept = resolveSectionId(this.collection()?.sections ?? [], groupId, had);
    this.sectionId.set(kept);
    // Losing a choice silently is the half the resolution rule cannot fix: the
    // form would stop showing the divider and simply save without it.
    if (had && !kept) this.toast.flash(this.i18n.t('toast.item.sectionCleared'));
    // A group that declares dividers reveals a fourth control mid-row.
    // Focusing it is what announces the reveal — nothing else on the page says
    // a new choice became available.
    if (!hadOptions && this.sectionOptions().length) this.focusIn('.pair .section select');
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
      year: Math.round(parseAmount(this.year())) || new Date().getFullYear(),
      value: parseAmount(this.value()),
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

  // --- validation -----------------------------------------------------------
  //
  // The only validated field on this form, and until now the refusal was a
  // toast that named no field, marked nothing and moved no focus — on a page
  // where Name can be 900px above the Save button.

  private readonly nameControl = viewChild<UiTextInput>('nameControl');

  /** The message under the Name field, as a key so the language can change. */
  protected readonly nameError = signal<MessageKey | null>(null);
  protected readonly nameErrorText = computed(() => {
    const key = this.nameError();
    return key ? this.i18n.t(key) : '';
  });

  /**
   * Validates on blur as well as on submit, so the requirement is learned
   * before the attempt rather than after it. Typing clears it immediately —
   * an error that outlives the fix is one people stop reading.
   */
  protected checkName(): void {
    this.nameError.set(this.name().trim() ? null : 'itemForm.error.nameRequired');
  }

  protected setName(value: string): void {
    this.name.set(value);
    if (this.nameError() && value.trim()) this.nameError.set(null);
  }

  protected async save(): Promise<void> {
    const collection = this.collection();
    if (!collection) return;
    const name = this.name().trim();
    if (!name) {
      this.nameError.set('itemForm.error.nameRequired');
      // The toast stays: it is what a screen-reader user hears at once. The
      // inline state is what a sighted user can still read a minute later.
      this.toast.flash(this.i18n.t('toast.item.needsName'));
      this.nameControl()?.focus();
      return;
    }
    this.nameError.set(null);
    // Bytes still going up would be saved out of: the manager appends their ids
    // after the queue drains, onto a component this navigation has destroyed.
    if (this.uploadsBusy()) {
      this.toast.flash(this.i18n.t('itemForm.uploadsPending'));
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
   * This used to be `window.confirm`, justified on the grounds that a
   * `CanDeactivate` must answer synchronously or hand back an Observable. That
   * is simply not true: `CanDeactivateFn` returns `MaybeAsync<GuardResult>` and
   * takes a `Promise<boolean>` — which is exactly what `ConfirmService.ask()`
   * is. Nothing half-finished is held in component state; the guard awaits the
   * promise the dialog already resolves.
   *
   * The real cost of the native box is the one rule 15 names: its buttons are
   * the browser's own "OK" and "Cancel", in the browser's language, so the
   * reader has to work out which one keeps their work. These say it —
   * "Discard the changes" against "Keep editing".
   */
  confirmLeave(): boolean | Promise<boolean> {
    if (!this.unsaved()) return true;
    return this.confirm.ask({
      titleKey: 'itemForm.leave.title',
      bodyKey: 'itemForm.leave.body',
      confirmKey: 'itemForm.leave.discard',
      cancelKey: 'itemForm.leave.keep',
      tone: 'danger',
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

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
