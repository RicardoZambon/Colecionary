import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'ui-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.lg]': 'size() === "lg"', '[class.sm]': 'size() === "sm"' },
  template: `{{ initials() }}`,
  styles: `
    :host {
      width: 30px;
      height: 30px;
      border-radius: var(--pill);
      background: var(--panel2);
      border: var(--bw) solid var(--border);
      color: var(--accent);
      display: grid;
      place-items: center;
      font-size: 10.5px;
      font-weight: 700;
      flex: none;
    }

    :host(.sm) {
      width: 27px;
      height: 27px;
      font-size: 9.5px;
    }

    :host(.lg) {
      width: 44px;
      height: 44px;
      font-size: 15px;
    }
  `,
})
export class UiAvatar {
  readonly initials = input.required<string>();
  readonly size = input<'sm' | 'md' | 'lg'>('md');
}
