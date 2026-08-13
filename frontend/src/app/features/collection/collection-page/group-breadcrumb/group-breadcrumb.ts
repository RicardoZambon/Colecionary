import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { GroupNode } from '../../../../core/models';
import { UiChip } from '../../../../shared/ui';

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
 */
@Component({
  selector: 'app-group-breadcrumb',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, UiChip],
  template: `
    <nav aria-label="Group path">
      @for (crumb of crumbs(); track crumb.id; let last = $last) {
        <ui-chip
          [link]="['/c', collectionId()]"
          [queryParams]="{ g: crumb.id }"
          [onPath]="!crumb.current"
          [selected]="crumb.current"
          [attr.aria-current]="crumb.current ? 'page' : null"
        >{{ crumb.label }}</ui-chip>
        @if (!last) {
          <span class="sep" aria-hidden="true">›</span>
        }
      }
    </nav>

    <!-- Only while the panel is hidden. With the tree on screen these chips
         would say a second time what it already says, one hop shallower. -->
    @if (collapsed()) {
      <span class="divider" aria-hidden="true"></span>
      <button
        type="button"
        class="panel-toggle"
        aria-expanded="false"
        title="Show the group panel"
        (click)="expandTree.emit()"
      >⟩ Group panel</button>
      @if (children().length) {
        <nav class="children" aria-label="Sub-groups">
          @for (child of children(); track child.id) {
            <ui-chip
              [small]="true"
              [link]="['/c', collectionId()]"
              [queryParams]="{ g: child.id }"
              [count]="child.count"
            >{{ child.name }}</ui-chip>
          }
        </nav>
      }
    }

    @if (pending()) {
      <input
        class="chip-input"
        placeholder="New group name… (Enter)"
        aria-label="New group name"
        autofocus
        (keydown)="nameKeydown.emit($event)"
        (blur)="nameCommit.emit($any($event.target).value)"
      />
    } @else {
      <ui-chip [small]="true" [dashed]="true" (click)="newGroup.emit()">+ New</ui-chip>
    }

    <a
      class="manage"
      [routerLink]="['/c', collectionId(), 'settings']"
      [queryParams]="{ tab: 'groups', g: currentId() }"
      title="Rename, nest, add fields and set targets for these groups"
    >⚙ Edit groups</a>
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
      font-size: 12px;
    }

    /* Separates path from children without a second row or a second label. */
    .divider {
      width: var(--bw);
      align-self: stretch;
      background: var(--border);
      margin: 0 2px;
    }

    .panel-toggle {
      border: var(--bw) dashed var(--border);
      border-radius: var(--pill);
      background: transparent;
      color: var(--muted);
      font-family: var(--font-body);
      font-size: 11.5px;
      padding: 4px 12px;
      cursor: pointer;
      white-space: nowrap;

      &:hover {
        color: var(--accent);
        border-color: var(--accent);
      }
    }

    .manage {
      font-size: 11.5px;
      color: var(--muted);
      white-space: nowrap;

      &:hover {
        color: var(--accent);
      }
    }

    .chip-input {
      border: var(--bw) dashed var(--accent);
      background: var(--panel);
      color: var(--text);
      border-radius: var(--pill);
      padding: 5px 13px;
      font-size: 12px;
      font-family: var(--font-body);
      outline: none;
      width: 180px;
    }
  `,
})
export class GroupBreadcrumb {
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
  // Not named `keydown`/`blur`: an output sharing a native event's name
  // shadows that event at every usage site, which is a trap for whoever binds
  // it next even though this component does emit its own.
  readonly nameKeydown = output<KeyboardEvent>();
  readonly nameCommit = output<string>();

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
