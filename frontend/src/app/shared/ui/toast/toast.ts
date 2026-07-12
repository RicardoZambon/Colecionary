import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ToastService } from '../../../core/state/toast.service';

/** Global toast outlet — rendered once in the app shell. */
@Component({
  selector: 'ui-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (toast.message(); as message) {
      <div class="toast" role="status">{{ message }}</div>
    }
  `,
  styles: `
    .toast {
      position: fixed;
      bottom: 22px;
      right: 22px;
      background: var(--accent);
      color: var(--accent-contrast);
      border-radius: var(--radius);
      padding: 10px 18px;
      font-size: 12.5px;
      font-weight: 700;
      box-shadow: var(--btn-shadow);
      z-index: 50;
    }
  `,
})
export class UiToast {
  protected readonly toast = inject(ToastService);
}
