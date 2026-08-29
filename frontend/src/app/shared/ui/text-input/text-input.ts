import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';

/**
 * Single-line text input. `variant="subtle"` uses the panel2 background
 * (search box, inline editors); default sits on a panel background.
 */
@Component({
  selector: 'ui-text-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <input
      [type]="type()"
      [value]="value()"
      [placeholder]="placeholder()"
      [attr.aria-label]="ariaLabel() || null"
      [class.subtle]="variant() === 'subtle'"
      (input)="onInput($event)"
      (keydown)="keydown.emit($event)"
      (blur)="blurred.emit()"
    />
  `,
  styles: `
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
  `,
})
export class UiTextInput {
  readonly value = model('');
  readonly placeholder = input('');
  readonly type = input('text');
  readonly variant = input<'panel' | 'subtle'>('panel');
  /**
   * Accessible name for a control the page labels by proximity rather than by
   * a `<label for>`. It has to be an input: `[attr.aria-label]` written at the
   * usage site lands on the `<ui-text-input>` wrapper, which is neither
   * focusable nor the thing being named.
   */
  readonly ariaLabel = input('');
  readonly keydown = output<KeyboardEvent>();
  readonly blurred = output<void>();

  protected onInput(event: Event): void {
    this.value.set((event.target as HTMLInputElement).value);
  }
}
