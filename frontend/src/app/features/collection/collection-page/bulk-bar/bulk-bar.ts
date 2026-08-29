import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';

import { I18nService, MessageKey } from '../../../../core/i18n';
import {
  COPY_STATUSES,
  CopyStatus,
  GroupField,
  GroupNode,
  Item,
  Section,
} from '../../../../core/models';
import { fieldsFor, flattenTree, resolveGroupId } from '../../../../core/utils/groups.util';
import { sectionsOf } from '../../../../core/utils/sections.util';
import { fieldValue } from '../../../../core/utils/sort.util';
import { TPipe } from '../../../../shared/pipes/t.pipe';
import { SelectOption, UiButton, UiSelect, UiTextInput } from '../../../../shared/ui';
import { BulkPatch, distinctValues, isEmptyPatch } from '../bulk-patch';

/**
 * The value picked when a select means "leave this alone".
 *
 * `~` is outside the id charset the backend accepts, the same trick
 * `UNGROUPED_ID` and `UNSECTIONED_ID` use, so it can never collide with a real
 * group or section id — which matters here because `''` is already taken: it is
 * the legitimate destination "no group".
 */
const KEEP = '~keep';

/** Draft keys. `field:<name>` mirrors the sort key spelling, for the same reason. */
const GROUP = 'group';
const SECTION = 'section';
const YEAR = 'year';
const VALUE = 'value';
const ADD_TAG = 'addTag';
const REMOVE_TAG = 'removeTag';
const STATUS = 'status';

/**
 * One field's draft.
 *
 * `touched` is the whole design. Without it there is no way to tell "leave
 * every one of these forty years alone" from "set them all to blank", and a
 * bulk editor that cannot express the first is useless while one that silently
 * does the second is dangerous.
 */
interface Draft {
  touched: boolean;
  value: string;
}

const UNTOUCHED: Draft = { touched: false, value: '' };

const COPY_STATUS_KEYS: Record<CopyStatus, MessageKey> = {
  Keep: 'copyStatus.keep',
  ForTrade: 'copyStatus.forTrade',
  ForSale: 'copyStatus.forSale',
};

/**
 * The bar that appears when rows are selected: what is selected, what can be
 * changed about all of them at once, and the two destructive-ish buttons.
 *
 * Rendered by `CollectionPage` rather than by the table, because the card grid
 * needs the identical bar and neither view knows about the other — the same
 * division that lets both render the same `SectionChunk[]`.
 *
 * It owns the draft and nothing else. The write is one full-document PUT and
 * that belongs to whoever owns the collection, so this emits a
 * {@link BulkPatch} and lets the page decide what happens to it. That is also
 * what makes a refused save recoverable: the page keeps the selection, this
 * component is not destroyed, and the draft is still on screen.
 */
@Component({
  selector: 'app-bulk-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe, UiButton, UiSelect, UiTextInput],
  templateUrl: './bulk-bar.html',
  styleUrl: './bulk-bar.scss',
})
export class BulkBar {
  private readonly i18n = inject(I18nService);

  /**
   * The selected items **that are currently visible**. The page hands over the
   * intersection, never the stored set, so nothing here can describe or touch a
   * row the user cannot see.
   */
  readonly items = input.required<Item[]>();
  readonly groups = input.required<GroupNode[]>();
  readonly sections = input.required<Section[]>();

  /**
   * Whether a write of this collection is already in flight.
   *
   * An input rather than the store, like every other presentational child here:
   * injecting VaultStore into a leaf drags VaultApi into the TestBed of
   * everything that renders it.
   *
   * It exists because a bulk apply is one full-document PUT, and a large
   * collection takes long enough for a second click to land before the first
   * answers. That second PUT quotes the version the first is about to move, so
   * the server refuses it — and the app used to explain the refusal as somebody
   * else having edited the collection. Nobody else had; the user had clicked
   * twice.
   */
  readonly saving = input(false);

  readonly applied = output<BulkPatch>();
  readonly removeRequested = output<void>();
  readonly cleared = output<void>();

  /** The field panel starts closed: most selections end in a delete or a move. */
  protected readonly open = signal(false);
  private readonly drafts = signal<Record<string, Draft>>({});

  protected readonly count = computed(() => this.items().length);

  protected readonly countLabel = computed(() =>
    this.i18n.plural(this.count(), 'bulk.selected.one', 'bulk.selected.other'),
  );

  /**
   * The group every selected item will be in once this patch lands: the picked
   * destination, or the one group they already share. Null when they are spread
   * across groups and no destination has been chosen — which is exactly when a
   * section cannot be set, since a section belongs to exactly one group.
   */
  protected readonly destinationGroupId = computed<string | null>(() => {
    const draft = this.draft(GROUP);
    if (draft.touched) return resolveGroupId(this.groups(), draft.value);
    const ids = new Set(this.items().map(item => item.groupId));
    return ids.size === 1 ? resolveGroupId(this.groups(), [...ids][0]) : null;
  });

  /** True while the selection spans groups — the reason the section row is off. */
  protected readonly groupsMixed = computed(() => this.destinationGroupId() === null);

  protected readonly destinationSections = computed(() =>
    sectionsOf(this.sections(), this.destinationGroupId()),
  );

  /**
   * The fields the destination group declares, merged down its ancestor path.
   *
   * Empty while the selection spans groups: which fields apply is a property of
   * one group, and guessing a union would offer a control whose value
   * `item-form-page` would later drop from half the items as undeclared. The
   * group row directly above is the way out of it.
   */
  protected readonly fields = computed<GroupField[]>(() =>
    fieldsFor(this.groups(), this.destinationGroupId()),
  );

  protected readonly groupOptions = computed<SelectOption[]>(() => [
    { value: KEEP, label: this.i18n.t('bulk.leaveAlone') },
    { value: '', label: this.i18n.t('group.none') },
    ...flattenTree(this.groups()).map(({ node, depth }) => ({
      value: node.id,
      label: (depth ? '   '.repeat(depth) + '↳ ' : '') + node.name,
    })),
  ]);

  protected readonly sectionOptions = computed<SelectOption[]>(() => [
    { value: KEEP, label: this.i18n.t('bulk.leaveAlone') },
    { value: '', label: this.i18n.t('section.none') },
    ...this.destinationSections().map(section => ({ value: section.id, label: section.name })),
  ]);

  protected readonly statusOptions = computed<SelectOption[]>(() => [
    { value: KEEP, label: this.i18n.t('bulk.leaveAlone') },
    ...COPY_STATUSES.map(status => ({
      value: status,
      label: this.i18n.t(COPY_STATUS_KEYS[status]),
    })),
  ]);

  // --- how many different values are in there now -------------------------

  protected readonly groupHint = computed(() =>
    this.hint(distinctValues(this.items(), item => item.groupId).length),
  );
  protected readonly sectionHint = computed(() =>
    this.hint(distinctValues(this.items(), item => item.sectionId).length),
  );
  protected readonly yearHint = computed(() =>
    this.hint(distinctValues(this.items(), item => String(item.year)).length),
  );
  protected readonly valueHint = computed(() =>
    this.hint(distinctValues(this.items(), item => (item.value ? String(item.value) : '')).length),
  );
  protected readonly statusHint = computed(() => {
    const seen = new Set<string>();
    for (const item of this.items()) for (const copy of item.copies) seen.add(copy.status);
    return this.hint(seen.size);
  });

  protected fieldHint(name: string): string {
    return this.hint(distinctValues(this.items(), item => fieldValue(item, name)).length);
  }

  /** A field a group declares maps straight onto the native input type. */
  protected inputType(field: GroupField): string {
    return field.type === 'text' ? 'text' : field.type;
  }

  protected fieldKey(name: string): string {
    return `field:${name}`;
  }

  // --- draft plumbing -----------------------------------------------------

  protected draft(key: string): Draft {
    return this.drafts()[key] ?? UNTOUCHED;
  }

  protected touched(key: string): boolean {
    return this.draft(key).touched;
  }

  /** What a select shows: its drafted value, or the "leave alone" sentinel. */
  protected selectValue(key: string): string {
    const draft = this.draft(key);
    return draft.touched ? draft.value : KEEP;
  }

  /** Picking the sentinel is how a select goes back to leaving things alone. */
  protected pickSelect(key: string, value: string): void {
    this.set(key, value === KEEP ? UNTOUCHED : { touched: true, value });
  }

  /**
   * Typing marks the field touched and keeps it touched — so deleting what you
   * typed reads as a deliberate clear, which is what it is. `reset` is how you
   * take the whole thought back.
   */
  protected type(key: string, value: string): void {
    this.set(key, { touched: true, value });
  }

  /** An explicit clear: touched, and empty. */
  protected clearField(key: string): void {
    this.set(key, { touched: true, value: '' });
  }

  /** Back to "leave alone". */
  protected reset(key: string): void {
    this.set(key, UNTOUCHED);
  }

  private set(key: string, draft: Draft): void {
    this.drafts.update(all => ({ ...all, [key]: draft }));
  }

  // --- keys, exposed to the template --------------------------------------

  protected readonly GROUP = GROUP;
  protected readonly SECTION = SECTION;
  protected readonly YEAR = YEAR;
  protected readonly VALUE = VALUE;
  protected readonly ADD_TAG = ADD_TAG;
  protected readonly REMOVE_TAG = REMOVE_TAG;
  protected readonly STATUS = STATUS;

  // --- applying -----------------------------------------------------------

  protected readonly patch = computed<BulkPatch>(() => {
    const out: BulkPatch = {};
    const group = this.draft(GROUP);
    if (group.touched) out.groupId = group.value;

    // Only when a section can mean something: with the selection spread across
    // groups there is no single set of dividers to point at, and the control is
    // disabled rather than silently applying to whichever group won.
    const section = this.draft(SECTION);
    if (section.touched && !this.groupsMixed()) out.sectionId = section.value;

    const year = this.draft(YEAR);
    if (year.touched) out.year = year.value;
    const value = this.draft(VALUE);
    if (value.touched) out.value = value.value;

    const fields: Record<string, string> = {};
    for (const field of this.fields()) {
      const draft = this.draft(this.fieldKey(field.name));
      if (draft.touched) fields[field.name] = draft.value;
    }
    if (Object.keys(fields).length) out.fields = fields;

    const add = this.draft(ADD_TAG);
    if (add.touched) out.addTag = add.value;
    const remove = this.draft(REMOVE_TAG);
    if (remove.touched) out.removeTag = remove.value;

    const status = this.draft(STATUS);
    if (status.touched && (COPY_STATUSES as readonly string[]).includes(status.value)) {
      out.copyStatus = status.value as CopyStatus;
    }
    return out;
  });

  /**
   * A patch that changes nothing is refused rather than sent. It would be a
   * full-document PUT that writes nothing, burns the collection's version and
   * reports success — the one kind of save that teaches a user to distrust the
   * button.
   */
  protected readonly canApply = computed(() => !isEmptyPatch(this.patch()));

  protected apply(): void {
    if (!this.canApply()) return;
    this.applied.emit(this.patch());
  }

  private hint(distinct: number): string {
    if (distinct === 0) return this.i18n.t('bulk.values.none');
    return this.i18n.plural(distinct, 'bulk.values.one', 'bulk.values.other');
  }
}
