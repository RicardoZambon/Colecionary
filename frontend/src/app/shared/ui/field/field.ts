import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Label + control layout used by every form field. */
@Component({
  selector: 'ui-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="label">{{ label() }}</label>
    <ng-content />
    @if (hint()) {
      <span class="hint">{{ hint() }}</span>
    }
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

    .hint {
      font-size: 11.5px;
      color: var(--text2);
    }
  `,
})
export class UiField {
  readonly label = input.required<string>();

  /**
   * Optional note under the control, for what the field does rather than what
   * it is called — "leave empty to follow the account", say. Empty renders
   * nothing, so existing fields are untouched.
   */
  readonly hint = input('');
}
