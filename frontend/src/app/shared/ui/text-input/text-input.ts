import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  model,
  output,
  viewChild,
} from '@angular/core';

import { UiIcon } from '../icon/icon';

/**
 * Single-line text input. `variant="subtle"` uses the panel2 background
 * (search box, inline editors); default sits on a panel background.
 *
 * `clearable` adds a clear button inside the field, shown only while there is
 * something to clear. It exists for the topbar search, which had no way out at
 * all: the only thing that emptied it was `clearFilters()` on the collection
 * page, reachable solely from the "nothing matches" empty state — so a search
 * that matched nothing could be cleared, and one that matched something could
 * not. Selecting the text and deleting it is not an affordance.
 */
@Component({
  selector: 'ui-text-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiIcon],
  template: `
    <span class="wrap">
      <input
        #control
        [type]="type()"
        [value]="value()"
        [placeholder]="placeholder()"
        [attr.aria-label]="ariaLabel() || null"
        [attr.aria-invalid]="invalid() ? 'true' : null"
        [attr.aria-required]="required() ? 'true' : null"
        [attr.aria-describedby]="describedBy() || null"
        [class.subtle]="variant() === 'subtle'"
        [class.has-clear]="showClear()"
        (input)="onInput($event)"
        (keydown)="keydown.emit($event)"
        (blur)="blurred.emit()"
      />
      @if (showClear()) {
        <button
          type="button"
          class="clear"
          [attr.aria-label]="clearLabel() || null"
          (click)="clear()"
        ><ui-icon name="close" [size]="12" /></button>
      }
    </span>
  `,
  styles: `
    :host {
      display: block;
    }

    .wrap {
      display: block;
      position: relative;
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

      /* Room for the button, so a long query does not run underneath it. */
      &.has-clear {
        padding-right: 34px;
      }
    }

    .clear {
      position: absolute;
      top: 0;
      right: 0;
      height: 100%;
      min-width: 30px;
      display: grid;
      place-items: center;
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--muted-strong);
      cursor: pointer;
      border-radius: var(--radius);
      transition: color var(--dur-fast) var(--ease-out);
    }

    .clear:hover {
      color: var(--text);
    }

    /* Hover does not exist on touch, and a control that does not visibly take
       the press reads as broken and gets tapped twice. */
    .clear:active {
      color: var(--accent-strong);
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
  /**
   * Validation state, and the id of the message that explains it.
   *
   * A page cannot express "this field is wrong, and the sentence under it says
   * why" without these: `[attr.aria-invalid]` written at the usage site lands
   * on the `<ui-text-input>` wrapper, which is not the field. The item form had
   * to set all three by reaching into this component's DOM after render, which
   * is a page doing a component's job — see `focus()` below for the other half.
   */
  readonly invalid = input(false);
  readonly required = input(false);
  readonly describedBy = input('');
  /** Offer a clear button once there is text. Needs `clearLabel` to be named. */
  readonly clearable = input(false);
  /** Accessible name for that button — it is icon-only. */
  readonly clearLabel = input('');
  readonly keydown = output<KeyboardEvent>();
  readonly blurred = output<void>();
  /** Fires after the field is emptied by the clear button, not by typing. */
  readonly cleared = output<void>();

  protected readonly showClear = computed(() => this.clearable() && this.value() !== '');

  private readonly control = viewChild<ElementRef<HTMLInputElement>>('control');

  /**
   * Move focus into the field.
   *
   * Exposed because "focus the first invalid field" is a form's job and the
   * field is inside this component — the alternative, which the item form
   * shipped, is a page querying another component's DOM for its own input.
   */
  focus(): void {
    this.control()?.nativeElement.focus();
  }

  protected onInput(event: Event): void {
    this.value.set((event.target as HTMLInputElement).value);
  }

  protected clear(): void {
    this.value.set('');
    this.cleared.emit();
  }
}
