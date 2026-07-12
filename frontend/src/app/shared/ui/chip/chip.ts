import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Pill-shaped filter/selector chip (groups, condition, status).
 * Emits nothing itself — attach (click) at the usage site.
 */
@Component({
  selector: 'ui-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="chip"
      [class.chip--selected]="selected()"
      [class.chip--dashed]="dashed()"
      [class.chip--on-path]="onPath()"
      [class.chip--small]="small()"
    >
      <span class="chip__label"><ng-content /></span>
      @if (count() !== null) {
        <span class="chip__count">{{ count() }}</span>
      }
    </button>
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
      cursor: pointer;
      transition: border-color 0.15s;

      &:hover {
        border-color: var(--accent);
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
}
