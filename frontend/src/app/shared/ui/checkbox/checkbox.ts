import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';

/**
 * A selection checkbox — for choosing which rows an action applies to.
 *
 * Deliberately not {@link UiToggle}, which is `role="switch"`: a switch turns
 * something on, and a row is not a setting. Screen readers announce the two
 * differently, and "selected" is the word this one needs.
 *
 * A real `<input type="checkbox">` rather than a styled button, because the
 * browser already gives it the role, the checked state, the space-bar
 * activation and — the part that cannot be reimplemented — the
 * `indeterminate` visual that a tri-state "select all" depends on.
 */
@Component({
  selector: 'ui-checkbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <input
      type="checkbox"
      [checked]="checked()"
      [indeterminate]="indeterminate()"
      [attr.aria-label]="ariaLabel() || null"
      [attr.aria-checked]="ariaChecked()"
      [disabled]="disabled()"
      (click)="onClick($event)"
      (keydown.shift.enter)="onClick($event)"
    />
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      /* The pseudo-element target below is positioned against this. */
      position: relative;
    }

    /*
     * A selection box is 15px because that is the size it should look, and 15px
     * is less than half the 44px a finger needs. So the visual box keeps its
     * size and an invisible target is centred on it — the same trick the filter
     * chips use, and for the same reason: growing the box would wreck the
     * density of a table row, which is the whole point of the list view.
     *
     * Only below the breakpoint where touch is the assumption; on a desktop the
     * pointer is precise and a 44px hit area would swallow the row around it.
     */
    @media (max-width: 900px) {
      :host::after {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        width: var(--tap, 44px);
        height: var(--tap, 44px);
        transform: translate(-50%, -50%);
      }
    }

    input {
      /*
       * Sized in px rather than off the spacing scale: this is a control whose
       * hit area is a fixed physical target, not a gap between two things.
       */
      width: 15px;
      height: 15px;
      margin: 0;
      cursor: pointer;
      /*
       * accent-color is the whole styling strategy. It repaints the native
       * checkbox with the theme's accent while leaving the platform's own
       * checkmark, focus ring and indeterminate dash intact — all three of
       * which a hand-built box loses, and the dash is load-bearing here.
       */
      accent-color: var(--accent);
      transition: opacity var(--dur-fast) var(--ease-out);
    }

    input:disabled {
      cursor: default;
      opacity: 0.4;
    }

    input:focus-visible {
      outline: var(--focus-width) solid var(--accent);
      outline-offset: var(--focus-offset);
    }
  `,
})
export class UiCheckbox {
  readonly checked = model(false);
  /**
   * Neither all nor none — the state a "select all" header sits in while some
   * of the rows below it are selected. Ignored while `checked` is true, exactly
   * as the platform does.
   */
  readonly indeterminate = input(false);
  readonly disabled = input(false);
  /**
   * Accessible name. There is no associated `<label>`: these live in a table
   * cell whose meaning comes from the row, so the name has to be passed in —
   * "Select N64 Gold Edition", not "checkbox".
   */
  readonly ariaLabel = input('');

  /**
   * Fires with the modifier keys of the click that caused it, so a list can
   * implement shift-click ranges without reading the event itself.
   *
   * Separate from the `checked` model on purpose: the model says what this one
   * box became, and that is all a simple caller needs. Only a caller that
   * wants ranges has to care how it got there.
   */
  readonly picked = output<{ checked: boolean; shift: boolean }>();

  /** Tri-state announces as "mixed", which is the ARIA spelling of the dash. */
  protected readonly ariaChecked = computed(() =>
    this.indeterminate() && !this.checked() ? 'mixed' : String(this.checked()),
  );

  protected onClick(event: Event): void {
    const input = event.target as HTMLInputElement;
    // The DOM has already flipped it; mirror that into the model rather than
    // negating our own value, or a click landing on an indeterminate box
    // disagrees with what the user just saw happen.
    const next = input.checked;
    this.checked.set(next);
    this.picked.emit({ checked: next, shift: (event as MouseEvent).shiftKey === true });
  }
}
