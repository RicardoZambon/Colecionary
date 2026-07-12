import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

export interface SelectOption {
  value: string;
  label: string;
}

@Component({
  selector: 'ui-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <select [value]="value()" [disabled]="disabled()" (change)="onChange($event)">
      @for (option of options(); track option.value) {
        <option [value]="option.value" [selected]="option.value === value()">
          {{ option.label }}
        </option>
      }
    </select>
  `,
  styles: `
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
      outline: none;

      &:disabled {
        color: var(--text2);
      }
    }

    :host(.compact) select {
      padding: 6px 8px;
      font-size: 11.5px;
      color: var(--text2);
    }
  `,
})
export class UiSelect {
  readonly value = model('');
  readonly options = input.required<SelectOption[]>();
  readonly disabled = input(false);

  protected onChange(event: Event): void {
    this.value.set((event.target as HTMLSelectElement).value);
  }
}
