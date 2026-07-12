import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Panel surface. `interactive` adds the hover affordance used by clickable cards. */
@Component({
  selector: 'ui-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.interactive]': 'interactive()',
    '[class.dashed]': 'dashed()',
  },
  template: `<ng-content />`,
  styles: `
    :host {
      display: block;
      background: var(--panel);
      border: var(--bw) solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      overflow: hidden;
    }

    :host(.interactive) {
      cursor: pointer;
      transition: border-color 0.15s;

      &:hover {
        border-color: var(--accent);
      }
    }

    :host(.dashed) {
      background: transparent;
      border-style: dashed;
      box-shadow: none;
    }
  `,
})
export class UiCard {
  readonly interactive = input(false);
  readonly dashed = input(false);
}
