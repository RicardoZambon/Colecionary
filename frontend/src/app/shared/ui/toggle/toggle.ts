import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

@Component({
  selector: 'ui-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      role="switch"
      class="track"
      [attr.aria-label]="ariaLabel() || null"
      [attr.aria-checked]="on()"
      [attr.aria-disabled]="disabled() ? 'true' : null"
      [disabled]="disabled()"
      [class.on]="on()"
      [class.disabled]="disabled()"
      (click)="on.set(!on())"
    >
      <span class="knob"></span>
    </button>
  `,
  styles: `
    :host {
      display: inline-block;
    }

    .track {
      width: 36px;
      height: 20px;
      border-radius: var(--pill);
      background: var(--panel2);
      border: none;
      position: relative;
      cursor: pointer;
      transition: background 0.15s;
      padding: 0;

      &.on {
        background: var(--accent);
      }
    }

    .track:disabled {
      cursor: default;
      opacity: 0.45;
    }

    .knob {
      position: absolute;
      top: 3px;
      left: 3px;
      width: 14px;
      height: 14px;
      border-radius: var(--pill);
      background: var(--panel);
      border: 1px solid var(--border);
      transition: left 0.15s;
    }

    .on .knob {
      left: 19px;
    }
  `,
})
export class UiToggle {
  readonly on = model(false);
  /**
   * Accessible name. A switch says whether it is on; only this says what it
   * switches — and these sit beside a `ui-field` label that is not associated
   * with them, so there is no fallback.
   */
  readonly ariaLabel = input('');
  /**
   * Reads and announces as unavailable, and does not fire.
   *
   * For a switch whose subject does not exist yet — link sharing describes a
   * public collection page that has not been built. The honest render of that
   * is a switch you can see and cannot flip, beside a line saying why; the
   * dishonest one is a switch that persists a promise nobody keeps.
   */
  readonly disabled = input(false);
}
