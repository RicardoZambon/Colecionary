import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

import { UiFieldControl } from '../field/field-control';

/**
 * Multi-line text. Extends {@link UiFieldControl} for the label association,
 * `aria-describedby`, `aria-invalid` and `focus()`.
 */
@Component({
  selector: 'ui-textarea',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <textarea
      #control
      [class.mono]="mono()"
      [value]="value()"
      [rows]="rows()"
      [placeholder]="placeholder()"
      [attr.id]="fieldId()"
      [attr.name]="name() || null"
      [attr.autocomplete]="autocomplete() || null"
      [attr.required]="required() || null"
      [attr.aria-label]="ariaLabel() || null"
      [attr.aria-describedby]="ariaDescribedBy()"
      [attr.aria-invalid]="ariaInvalid()"
      (input)="onInput($event)"
    ></textarea>
  `,
  styles: `
    @use '../../../../styles/mixins' as *;

    :host {
      display: block;
    }

    textarea {
      width: 100%;
      background: var(--panel);
      border: var(--bw) solid var(--border);
      color: var(--text);
      border-radius: var(--radius);
      padding: 9px 12px;
      font-family: var(--font-body);
      font-size: 13px;
      /* Deliberately no 'outline: none'. Angular scopes this rule to
         textarea[_ngcontent-…], which outranks the global :focus-visible ring
         in styles.scss — suppressing it here leaves every textarea in the app
         with no visible focus at all. */
      resize: vertical;
    }

    textarea[aria-invalid='true'] {
      border-color: var(--danger);
    }

    /*
     * For text whose shape carries meaning — delimited columns, an id, a key.
     * An input on the component rather than a font set from the page: a host
     * rule cannot reach past this element's own declaration, so a page that
     * tried would silently get the body face anyway.
     */
    textarea.mono {
      font-family: var(--font-mono);
    }

    @include upto($bp-lg) {
      textarea {
        min-height: var(--tap);
      }
    }
  `,
})
export class UiTextarea extends UiFieldControl {
  readonly value = model('');
  readonly rows = input(3);
  readonly placeholder = input('');
  /** Monospace, for content read as columns rather than as prose. */
  readonly mono = input(false);
  /**
   * Accessible name, for the composers that sit outside a `ui-field` — the same
   * input its two siblings have, and for the same reason: written at the usage
   * site it would land on the wrapper, which is not the focusable thing.
   */
  readonly ariaLabel = input('');
  readonly autocomplete = input('');
  readonly name = input('');
  /** See `ui-text-input`: announces the requirement, validates nothing. */
  readonly required = input(false);

  protected onInput(event: Event): void {
    this.value.set((event.target as HTMLTextAreaElement).value);
  }
}
