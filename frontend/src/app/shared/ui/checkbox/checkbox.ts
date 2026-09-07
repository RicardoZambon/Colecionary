import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';

import { UiFieldControl } from '../field/field-control';

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
  /*
   * The claim, on the element the claim is about.
   *
   * It sat on the inner input, where it exempted that input from the tap-size
   * sweep (which walks up with `closest`) but matched nothing that names
   * ui-checkbox — so the companion check that *presses* a claimed target found
   * nothing to press, and the exemption was on trust in both directions. On the
   * host it does both jobs: the input is still inside a [data-tap-ok] ancestor,
   * and the component is now findable as the thing making the promise.
   */
  host: { 'data-tap-ok': '' },
  template: `
    <!--
      The label is the touch target, and it has to be an element that can act.
      A pseudo-element's hit test resolves to the element that owns it, so the
      44px area used to belong to <ui-checkbox> itself — not a control, no
      handler — and a press 18px below the box hit-tested fine and toggled
      nothing. An <input> is a replaced element and cannot carry a pseudo-element
      of its own, so the target needs a real box around it: this one.
    -->
    <label class="hit" (click)="onLabelClick($event)">
      <input
        #control
        type="checkbox"
        [checked]="checked()"
        [indeterminate]="indeterminate()"
        [attr.id]="fieldId()"
        [attr.aria-label]="ariaLabel() || null"
        [attr.aria-describedby]="ariaDescribedBy()"
        [attr.aria-checked]="ariaChecked()"
        [disabled]="disabled()"
        (click)="onClick($event)"
        (keydown.shift.enter)="onShiftEnter($event)"
      />
    </label>
  `,
  styles: `
    @use '../../../../styles/mixins' as *;

    :host {
      display: inline-flex;
      align-items: center;
    }

    .hit {
      display: inline-flex;
      align-items: center;
      cursor: pointer;
      /* The target below is positioned against this. */
      position: relative;
    }

    /*
     * The 44px touch target, on the label rather than on the host.
     *
     * It lived in styles.scss on ui-checkbox itself, and it was hit-testable
     * without being actionable: a press in the grown area returned
     * UI-CHECKBOX from elementFromPoint and left the box unchanged, everywhere
     * in the app. The data-tap-ok on the host exempts this control from the
     * automated tap sweep, so that made the exemption a false claim — worse
     * than the original miss, because it silenced the check that would have
     * found it.
     *
     * 15px is still the size it should *look*: growing the box itself would
     * wreck the density of the table row it lives in, which is the same trade
     * the filter chips make.
     */
    @include upto($bp-lg) {
      .hit::after {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        width: var(--tap);
        height: var(--tap);
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
export class UiCheckbox extends UiFieldControl {
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

  /**
   * A press in the grown target, which lands on the label and not on the input.
   *
   * Written out rather than left to the label's own activation behavior for one
   * reason: that behavior synthesises a click on the control, and the synthetic
   * event does **not** carry the modifier keys — so shift-click range selection
   * would work on the 15px box and silently stop working in the 44px area
   * around it, which is the harder half to notice. `preventDefault` cancels the
   * synthesis so this can do the toggle with the real event.
   *
   * A press on the input itself arrives here too, by bubbling, and is left
   * alone: `onClick` has already handled it, and the label's own activation
   * behavior is skipped by the platform for a target inside its control.
   */
  protected onLabelClick(event: MouseEvent): void {
    if (event.target !== event.currentTarget) return;
    if (this.disabled()) return;

    event.preventDefault();
    const input = this.control()?.nativeElement as HTMLInputElement | undefined;
    if (!input) return;
    const next = !input.checked;
    input.checked = next;
    // Clicking a checkbox focuses it, and preventDefault took that away with
    // the synthesis. It matters beyond the ring: the next Space, and a
    // shift-click range that starts from wherever focus is.
    input.focus();
    this.commit(next, event.shiftKey);
  }

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
