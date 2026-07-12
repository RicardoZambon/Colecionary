import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Label + control layout used by every form field. */
@Component({
  selector: 'ui-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="label">{{ label() }}</label>
    <ng-content />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .label {
      font-family: var(--font-mono);
      font-size: 10px;
      letter-spacing: 0.1em;
      color: var(--muted);
      text-transform: uppercase;
    }
  `,
})
export class UiField {
  readonly label = input.required<string>();
}
