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
      (keydown.shift.enter)="onShiftEnter($event)"
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
     * The 44px touch target is NOT here. It is a breakpointed rule, and an
     * inline styles block cannot @use the breakpoint mixins, so writing it here
     * meant a third hand-copied 900 beside the two in _mixins.scss and
     * layout.service.ts. It lives in styles.scss instead, next to the other
     * tap-target rules, where it can say upto($bp-lg) and mean it.
     */

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

  protected onClick(event: MouseEvent): void {
    const input = event.target as HTMLInputElement;
    // The DOM has already flipped it; mirror that into the model rather than
    // negating our own value, or a click landing on an indeterminate box
    // disagrees with what the user just saw happen. Space arrives here too —
    // the platform dispatches a real click for it, carrying the modifier keys,
    // which is what makes shift+Space the keyboard twin of shift-click.
    this.commit(input.checked, event.shiftKey);
  }

  /**
   * Enter is the one path where the browser has *not* flipped the box, because
   * Enter does not activate a checkbox at all — so this handler has to do both
   * halves itself.
   *
   * Reading `input.checked` here, as the click path does, reported the state the
   * box was already in. A caller comparing that against its own record saw "no
   * change" and did nothing, so the key looked dead; the one caller that noticed
   * worked around it by reading "requested equals current" as "toggle", which is
   * a workaround for this bug living in somebody else's file.
   */
  protected onShiftEnter(event: Event): void {
    const input = event.target as HTMLInputElement;
    const next = !input.checked;
    // Keep the element in step with the model, or the next click computes from
    // a box whose visual state and `checked` disagree.
    input.checked = next;
    this.commit(next, true);
  }

  private commit(next: boolean, shift: boolean): void {
    this.checked.set(next);
    this.picked.emit({ checked: next, shift });
  }
}
