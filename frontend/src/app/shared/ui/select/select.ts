import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';

import { UiFieldControl } from '../field/field-control';

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * A native `<select>` — the platform picker beats a custom listbox on a phone
 * and with assistive technology, so this stays native on purpose.
 *
 * Extends {@link UiFieldControl} for the label association,
 * `aria-describedby`, `aria-invalid` and `focus()`.
 */
@Component({
  selector: 'ui-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <select
      #control
      [value]="value()"
      [disabled]="disabled()"
      [attr.id]="fieldId()"
      [attr.name]="name() || null"
      [attr.aria-label]="ariaLabel() || null"
      [attr.aria-describedby]="ariaDescribedBy()"
      [attr.aria-invalid]="ariaInvalid()"
      [attr.title]="selectedLabel()"
      (change)="onChange($event)"
    >
      @for (option of options(); track option.value) {
        <option [value]="option.value" [selected]="option.value === value()">
          {{ option.label }}
        </option>
      }
    </select>
  `,
  styles: `
    @use '../../../../styles/mixins' as *;

    :host {
      display: block;
    }

    select {
      width: 100%;
      background: var(--panel);
      border: var(--bw) solid var(--border);
      color: var(--text);
      border-radius: var(--radius);
      padding: 9px 10px;
      font-family: var(--font-body);
      font-size: 13px;
      /* Deliberately no 'outline: none'. Angular scopes this rule to
         select[_ngcontent-…], which outranks the global :focus-visible ring
         in styles.scss — suppressing it here leaves every select in the app
         with no visible focus at all. */

      &:disabled {
        color: var(--text2);
      }
    }

    select[aria-invalid='true'] {
      border-color: var(--danger);
    }

    :host(.compact) select {
      padding: 6px 8px;
      font-size: 11.5px;
      color: var(--text2);
    }

    @include upto($bp-lg) {
      select {
        min-height: var(--tap);
      }
    }
  `,
})
export class UiSelect extends UiFieldControl {
  readonly value = model('');
  readonly options = input.required<SelectOption[]>();
  readonly disabled = input(false);
  readonly name = input('');
  /**
   * Accessible name for the selects in dense rows, which have no `ui-field`
   * label beside them — a bare combobox announces its value and nothing about
   * what the value is for.
   */
  readonly ariaLabel = input('');

  /**
   * The chosen option's full text, as the control's tooltip.
   *
   * A closed `<select>` clips its value with no way to see the rest, and the
   * group picker's options are indented paths — so what a narrow column shows
   * is whitespace and a fragment. One attribute makes the whole label readable
   * on hover; touch still has no answer, which is the `ui-tooltip` gap.
   */
  protected readonly selectedLabel = computed(
    () => this.options().find(o => o.value === this.value())?.label ?? null,
  );

  protected onChange(event: Event): void {
    this.value.set((event.target as HTMLSelectElement).value);
  }
}
