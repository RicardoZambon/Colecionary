import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'ui-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="track" role="progressbar" [attr.aria-valuenow]="pct()" aria-valuemin="0" aria-valuemax="100">
      <div class="fill" [style.width.%]="pct()"></div>
    </div>
  `,
  styles: `
    .track {
      height: 5px;
      background: var(--panel2);
      border-radius: var(--pill);
      overflow: hidden;
    }

    .fill {
      height: 100%;
      background: var(--accent);
    }
  `,
})
export class UiProgress {
  readonly pct = input.required<number>();
}
