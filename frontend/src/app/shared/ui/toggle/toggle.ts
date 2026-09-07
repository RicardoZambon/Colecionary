import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

import { UiFieldControl } from '../field/field-control';

@Component({
  selector: 'ui-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      #control
      type="button"
      role="switch"
      class="track"
      data-tap-ok
      [attr.id]="fieldId()"
      [attr.aria-label]="ariaLabel() || null"
      [attr.aria-describedby]="ariaDescribedBy()"
      [attr.aria-checked]="on()"
      [attr.aria-disabled]="disabled() ? 'true' : null"
      [class.on]="on()"
      [class.disabled]="disabled()"
      (click)="flip()"
    >
      <span class="knob"></span>
    </button>
  `,
  styles: `
    @use '../../../../styles/mixins' as *;

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

    /*
     * aria-disabled, not the native disabled attribute — the pattern
     * ui-button's muted input documents. The native one takes the switch out
     * of the tab order, so a screen-reader user never reaches it and never
     * hears the sentence beside it saying why it cannot be flipped, which is
     * the entire point of the state. It stays reachable, announces as
     * unavailable, and does nothing when clicked.
     */
    .track.disabled {
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
      border: var(--bw) solid var(--border);
      transition: left 0.15s;
    }

    .on .knob {
      left: 19px;
    }

    /*
     * Grow the target, keep the switch. A 36x20 pill is small enough that a
     * thumb lands on the label beside it, but a switch stretched to 44px tall
     * stops reading as a switch — so the painted pill keeps its size and an
     * absolutely positioned pseudo-element takes the press, the same trade the
     * chips and the reframe pip make.
     */
    @include upto($bp-lg) {
      .track {
        position: relative;

        &::after {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: var(--tap);
          height: var(--tap);
          transform: translate(-50%, -50%);
        }
      }
    }
  `,
})
export class UiToggle extends UiFieldControl {
  readonly on = model(false);
  /**
   * Accessible name. A switch says whether it is on; only this says what it
   * switches — and these sit beside a `ui-field` label that is not associated
   * with them, so there is no fallback.
   */
  readonly ariaLabel = input('');
  /**
   * Reads and announces as unavailable, and does not fire — but stays
   * focusable, so the reason can be read. See the styles.
   *
   * For a switch whose subject does not exist yet — link sharing describes a
   * public collection page that has not been built. The honest render of that
   * is a switch you can see and cannot flip, beside a line saying why; the
   * dishonest one is a switch that persists a promise nobody keeps.
   */
  readonly disabled = input(false);

  protected flip(): void {
    if (this.disabled()) return;
    this.on.set(!this.on());
  }
}
