import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  input,
  output,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { GroupNode } from '../../../../core/models';
import { groupLinkParams } from '../../browse-params';
import { TPipe } from '../../../../shared/pipes/t.pipe';
import { UiChip, UiIcon, UiInlineEdit } from '../../../../shared/ui';

interface Crumb {
  id: string | null;
  label: string;
  current: boolean;
}

export interface ChildChip {
  id: string;
  name: string;
  /** "3/24" — owned against whatever this group measures itself by. */
  count: string;
}

/** The id of the panel this strip's disclosure controls, in the page's template. */
export const GROUP_PANEL_ID = 'group-panel';

/**
 * One navigation strip: where you are, then where you can go next.
 *
 * Ancestry and children deliberately share a line. As two stacked rows of
 * pills they read as the same control repeated — the distinction between "the
 * path behind me" and "the groups below me" is not something a second row of
 * identical chips communicates.
 *
 * Built from the same `ui-chip` the old drill-down row used, as anchors via
 * the chip's `link` input, so middle-click and open-in-new-tab work on a
 * segment.
 *
 * **This strip is the one home for group creation and group editing, and the one
 * home for the panel's disclosure.** The screen used to spread group management
 * over four controls in two stacked rows — this strip's `+ New` and `Edit
 * groups`, plus a `GROUPS` panel that carried its own collapse chevron — and the
 * two collapse controls swapped places with each other, so pressing either one
 * destroyed the button that had just been pressed and dropped focus to the top
 * of the document.
 *
 * The panel keeps the job the chips cannot do (the whole map, with counts and
 * progress) and stops being a control surface: its `‹` is gone and the
 * always-present disclosure below lives here instead. Creation stays here rather
 * than moving into the panel's head, which was the other candidate — a `+ New`
 * inside a collapsible panel disappears with it, and below `$bp-xl` the panel
 * starts hidden, so the only way to create a group would have been to open a
 * panel first.
 */
@Component({
  selector: 'app-group-breadcrumb',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TPipe, UiChip, UiIcon, UiInlineEdit],
  template: `
    <nav [attr.aria-label]="'breadcrumb.pathAria' | t">
      @for (crumb of crumbs(); track crumb.id; let last = $last) {
        <ui-chip
          [link]="['/c', collectionId()]"
          [queryParams]="linkParams(crumb.id)"
          [onPath]="!crumb.current"
          [selected]="crumb.current"
          [attr.aria-current]="crumb.current ? 'page' : null"
        >{{ crumb.label }}</ui-chip>
        @if (!last) {
          <ui-icon class="sep" name="chevron-right" [size]="11" [strokeWidth]="2.2" />
        }
      }
    </nav>

    <span class="divider" aria-hidden="true"></span>

    <!--
      Always rendered, in both states. Two mutually exclusive buttons — one in
      the panel head, one here — meant whichever was pressed was the one removed
      from the document, so focus was lost in both directions and nothing said a
      panel had opened. aria-controls is dropped while the panel is absent: it
      may not name an element that is not in the document.
    -->
    <button
      type="button"
      class="panel-toggle"
      [attr.aria-expanded]="!collapsed()"
      [attr.aria-controls]="collapsed() ? null : panelId"
      [title]="(collapsed() ? 'breadcrumb.showPanel' : 'breadcrumb.hidePanelLabel') | t"
      (click)="expandTree.emit()"
    >
      <ui-icon
        [name]="collapsed() ? 'chevron-right' : 'chevron-left'"
        [size]="11"
        [strokeWidth]="2.2"
      />{{ 'breadcrumb.groupPanel' | t }}
    </button>

    <!-- Only while the panel is hidden. With the tree on screen these chips
         would say a second time what it already says, one hop shallower. -->
    @if (collapsed() && children().length) {
      <nav class="children" [attr.aria-label]="'breadcrumb.subGroupsAria' | t">
        @for (child of children(); track child.id) {
          <ui-chip
            [small]="true"
            [link]="['/c', collectionId()]"
            [queryParams]="linkParams(child.id)"
            [count]="child.count"
          >{{ child.name }}</ui-chip>
        }
      </nav>
    }

    @if (canEdit()) {
      @if (pending()) {
        <!--
          ui-inline-edit rather than a hand-rolled input: it takes the caret on
          reveal, which the autofocus attribute cannot do for content inserted
          after load — the box used to open with the caret nowhere, so typing
          did nothing until you clicked the box you had just summoned.
        -->
        <ui-inline-edit
          class="new-group"
          [placeholder]="'breadcrumb.newGroupPlaceholder' | t"
          [ariaLabel]="'breadcrumb.newGroupAria' | t"
          (committed)="nameCommit.emit($event)"
          (cancelled)="nameCancelled.emit()"
        />
      } @else {
        <ui-chip
          #newChip
          [small]="true"
          [dashed]="true"
          (click)="newGroup.emit()"
        >{{ 'breadcrumb.new' | t }}</ui-chip>
      }

      <!-- The settings route is refused by canEditGuard anyway, so a reader
           following this link would be bounced straight back. Better not to
           offer the round trip. -->
      <a
        class="manage"
        [routerLink]="['/c', collectionId(), 'settings']"
        [queryParams]="{ tab: 'groups', g: currentId() }"
        [title]="'breadcrumb.editGroupsTitle' | t"
      ><ui-icon name="gear" [size]="12" />{{ 'breadcrumb.editGroups' | t }}</a>
    }
  `,
  styles: `
    /* No border of its own: it shares one bar with the item controls, and the
       bar owns the rule under it. */
    :host {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      min-width: 0;
    }

    nav {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      min-width: 0;
    }

    .sep {
      color: var(--muted);
    }

    /* Separates path from controls without a second row or a second label. */
    .divider {
      width: var(--bw);
      align-self: stretch;
      background: var(--border);
      margin: 0 2px;
    }

    .panel-toggle {
      display: inline-flex;
      align-items: center;
      gap: var(--sp-1);
      border: var(--bw) dashed var(--border);
      border-radius: var(--pill);
      background: transparent;
      /* The secondary type layer, not the decorative grey: --muted is below AA
         on purpose and nothing readable may use it. */
      color: var(--muted-strong);
      font-family: var(--font-body);
      font-size: 11.5px;
      padding: 4px 12px;
      cursor: pointer;
      white-space: nowrap;

      &:hover {
        color: var(--accent-strong);
        border-color: var(--accent);
      }

      &[aria-expanded='true'] {
        border-style: solid;
        border-color: var(--accent);
        color: var(--accent-strong);
      }
    }

    /* The gear used to be a glyph inside the translated label. It is a mark
       now, so the row has to space it — and the label keeps its own words in
       both languages. */
    .manage {
      display: inline-flex;
      align-items: center;
      gap: var(--sp-1);
      font-size: 11.5px;
      color: var(--muted-strong);
      white-space: nowrap;

      &:hover {
        color: var(--accent-strong);
      }
    }

    /* The composer takes the same footprint the dashed chip had, so summoning
       it does not reflow the strip. ui-text-input carries the focus ring and
       the tap height the one-off input it replaced was missing. */
    .new-group {
      width: 180px;
      flex: none;
    }
  `,
})
export class GroupBreadcrumb {
  /**
   * Whether to offer the write affordances at all.
   *
   * An **input**, not a read of `VaultStore.canEdit`, even though that is where
   * the answer comes from. Injecting the store into a presentational child drags
   * `VaultApi` into the TestBed of every component that renders it — the same
   * reason `CurrencyService` exists as a dependency-free signal rather than
   * letting the money pipe reach for the store. The page reads it once and
   * passes it down.
   *
   * Defaults to true so an un-passed caller keeps the behaviour it had, and so
   * this fails open exactly as the store's own computed does.
   */
  readonly canEdit = input(true);

  /** Opening a group keeps the filters and drops the ad-hoc order. */
  protected readonly linkParams = groupLinkParams;
  protected readonly panelId = GROUP_PANEL_ID;

  readonly collectionId = input.required<string>();
  readonly collectionName = input.required<string>();
  /** Root → … → selected group, from `pathOf`. Empty at the collection root. */
  readonly path = input.required<GroupNode[]>();
  /** The groups one level below whatever is open. Shown only when collapsed. */
  readonly children = input.required<ChildChip[]>();
  /** The group panel is hidden, so this strip stands in for it. */
  readonly collapsed = input(false);
  /** A "+ New" pill is being filled in. */
  readonly pending = input(false);

  readonly newGroup = output<void>();
  readonly expandTree = output<void>();
  // Not named `blur`/`keydown`: an output sharing a native event's name shadows
  // that event at every usage site, which is a trap for whoever binds it next.
  readonly nameCommit = output<string>();
  /** Escape, or a commit with nothing typed. Means "no group was created". */
  readonly nameCancelled = output<void>();

  // read: ElementRef, or the query hands back the UiChip instance and the
  // focus call has no element to reach for.
  private readonly newChip = viewChild('newChip', { read: ElementRef });
  private wasPending = false;

  constructor() {
    // Focus comes back to the chip that opened the composer, whichever way the
    // composer closed. Without it, committing a name detached the focused input
    // and the next Tab restarted at the skip link — the same contract
    // layout/nav-focus.ts holds for the nav drawer's toggle.
    afterRenderEffect(() => {
      const pending = this.pending();
      if (!pending && this.wasPending) {
        const chip = this.newChip()?.nativeElement as HTMLElement | undefined;
        chip?.querySelector('button')?.focus();
      }
      this.wasPending = pending;
    });
  }

  protected readonly currentId = computed(() => this.path().at(-1)?.id ?? null);

  protected readonly crumbs = computed<Crumb[]>(() => {
    const path = this.path();
    return [
      { id: null, label: this.collectionName(), current: path.length === 0 },
      ...path.map((node, i) => ({
        id: node.id,
        label: node.name,
        current: i === path.length - 1,
      })),
    ];
  });
}
