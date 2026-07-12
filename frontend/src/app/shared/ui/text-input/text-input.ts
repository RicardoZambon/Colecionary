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
      outline: none;

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
  readonly keydown = output<KeyboardEvent>();
  readonly blurred = output<void>();

  protected onInput(event: Event): void {
    this.value.set((event.target as HTMLInputElement).value);
  }
}
