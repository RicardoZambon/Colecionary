import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Params, RouterLink } from '@angular/router';

/**
 * Pill-shaped filter/selector chip (groups, condition, status).
 *
 * Renders a `<button>` by default and emits nothing — attach `(click)` at the
 * usage site. Pass `link` and it renders a real `<a>` instead: a chip that
 * navigates has to be an anchor so middle-click and open-in-new-tab work, and
 * wrapping the button version in an anchor would nest a button inside a link,
 * which is invalid and breaks both.
 */
@Component({
  selector: 'ui-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, RouterLink],
  template: `
    <!-- Exactly ONE <ng-content>, stamped into whichever element is rendered.
         Two of them — one per branch — silently leaves the other empty:
         projection happens once, and the label vanished from every chip that
         navigated. -->
    <ng-template #body>
      <span class="chip__label"><ng-content /></span>
      @if (count() !== null) {
        <span class="chip__count">{{ count() }}</span>
      }
    </ng-template>

    @if (link(); as target) {
      <a
        class="chip"
        [routerLink]="target"
        [queryParams]="queryParams()"
        queryParamsHandling="merge"
        [class.chip--selected]="selected()"
        [class.chip--dashed]="dashed()"
        [class.chip--on-path]="onPath()"
        [class.chip--small]="small()"
      >
        <ng-container [ngTemplateOutlet]="body" />
      </a>
    } @else {
      <button
        type="button"
        class="chip"
        [class.chip--selected]="selected()"
        [class.chip--dashed]="dashed()"
        [class.chip--on-path]="onPath()"
        [class.chip--small]="small()"
      >
        <ng-container [ngTemplateOutlet]="body" />
      </button>
    }
  `,
  styles: `
    :host {
      display: inline-block;
    }

    .chip {
      display: flex;
      gap: 6px;
      align-items: center;
      border: var(--bw) solid var(--border);
      background: transparent;
      color: var(--text2);
      border-radius: var(--pill);
      padding: 5px 13px;
      font-size: 12px;
      font-weight: 600;
      font-family: var(--font-body);
      cursor: pointer;
      transition: border-color 0.15s;

      &:hover {
        border-color: var(--accent);
        text-decoration: none;
      }
    }

    .chip--small {
      padding: 4px 12px;
      font-size: 11.5px;
    }

    .chip--selected {
      border-color: var(--accent);
      background: var(--accent);
      color: var(--accent-contrast);
    }

    .chip--on-path {
      border-color: var(--accent);
      color: var(--accent);
    }

    .chip--dashed {
      border-style: dashed;
      color: var(--accent);
    }

    .chip__count {
      font-size: 10.5px;
      opacity: 0.65;
    }
  `,
})
export class UiChip {
  readonly selected = input(false);
  /** Ancestor of the selected group — accent outline, no fill. */
  readonly onPath = input(false);
  readonly dashed = input(false);
  readonly small = input(false);
  readonly count = input<string | number | null>(null);
  /** Router commands. Set this to render an anchor instead of a button. */
  readonly link = input<unknown[] | null>(null);
  readonly queryParams = input<Params | null>(null);
}
