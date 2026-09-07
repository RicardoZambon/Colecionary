import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';

import { UiFieldControl } from '../field/field-control';

/**
 * Single-line text input. `variant="subtle"` uses the panel2 background
 * (search box, inline editors); default sits on a panel background.
 *
 * Extends {@link UiFieldControl}, which is where the label association, the
 * `aria-describedby` wiring, `aria-invalid` and `focus()` come from — see that
 * class for why they are not written out here.
 */
@Component({
  selector: 'ui-text-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <input
      #control
      [type]="type()"
      [value]="value()"
      [placeholder]="placeholder()"
      [attr.id]="fieldId()"
      [attr.name]="name() || null"
      [attr.autocomplete]="autocomplete() || null"
      [attr.inputmode]="inputMode() || null"
      [attr.required]="required() || null"
      [attr.aria-label]="ariaLabel() || null"
      [attr.aria-describedby]="ariaDescribedBy()"
      [attr.aria-invalid]="ariaInvalid()"
      [class.subtle]="variant() === 'subtle'"
      (input)="onInput($event)"
      (keydown)="keydown.emit($event)"
      (blur)="blurred.emit()"
    />
  `,
  styles: `
    @use '../../../../styles/mixins' as *;

    :host {
      display: block;
    }

    input {
      width: 100%;
      background: var(--panel);
      border: var(--bw) solid var(--border);
      color: var(--text);
      border-radius: var(--radius);
      padding: 9px 12px;
      font-family: var(--font-body);
      font-size: 13px;
      /* Deliberately no 'outline: none'. Angular scopes this rule to
         input[_ngcontent-…], which outranks the global :focus-visible ring
         in styles.scss — suppressing it here leaves every text field in the app
         with no visible focus at all. */

      &.subtle {
        background: var(--panel2);
      }
    }

    /*
     * A refused value is bordered, not only announced: aria-invalid is
     * invisible, and the message under the field is below the fold on a phone.
     */
    input[aria-invalid='true'] {
      border-color: var(--danger);
    }

    /* Below the tablet breakpoint a text box is a touch target like any other.
       ui-date-input is the same box and was already in the list in
       styles.scss; this one was not, which read as an oversight. */
    @include upto($bp-lg) {
      input {
        min-height: var(--tap);
      }
    }
  `,
})
export class UiTextInput extends UiFieldControl {
  readonly value = model('');
  readonly placeholder = input('');
  readonly type = input('text');
  readonly variant = input<'panel' | 'subtle'>('panel');
  /**
   * Accessible name for a control the page labels by proximity rather than by
   * a `<label for>`. It has to be an input: `[attr.aria-label]` written at the
   * usage site lands on the `<ui-text-input>` wrapper, which is neither
   * focusable nor the thing being named.
   *
   * Inside a `ui-field` the label already names the control, and this is not
   * needed.
   */
  readonly ariaLabel = input('');
  /**
   * The browser's autofill hint — `username`, `current-password`, `off`.
   *
   * Not decoration: with no `name`, no `id` and an unassociated label, a
   * password manager had nothing at all to go on, so the login form could
   * neither be filled nor saved. `name` exists for the same reason and for the
   * form posts that will eventually want it.
   */
  readonly autocomplete = input('');
  readonly name = input('');
  /** The on-screen keyboard to raise — `numeric`, `email`, `decimal`. */
  readonly inputMode = input('');
  /**
   * Marks the control required for assistive technology and for the browser's
   * own hints. It does not validate anything: the refusal and its wording stay
   * with the page, which is the only place that knows what "missing" costs.
   */
  readonly required = input(false);
  readonly keydown = output<KeyboardEvent>();
  readonly blurred = output<void>();

  protected onInput(event: Event): void {
    this.value.set((event.target as HTMLInputElement).value);
  }
}
