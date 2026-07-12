import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';

/**
 * Click-to-open dropdown. Project the trigger with `[ddTrigger]` and the
 * panel content with `[ddPanel]`; call `close()` from panel item handlers.
 */
@Component({
  selector: 'ui-dropdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="trigger" (click)="toggle()">
      <ng-content select="[ddTrigger]" />
    </div>
    @if (open()) {
      <div class="backdrop" (click)="close()"></div>
      <div class="panel" [style.width.px]="width()">
        <ng-content select="[ddPanel]" />
      </div>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: inline-block;
    }

    .trigger {
      cursor: pointer;
    }

    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 69;
    }

    .panel {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      background: var(--panel);
      border: var(--bw) solid var(--border);
      border-radius: var(--radius);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
      z-index: 70;
      padding: 6px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
  `,
})
export class UiDropdown {
  readonly width = input(236);
  readonly open = signal(false);

  toggle(): void {
    this.open.update(v => !v);
  }

  close(): void {
    this.open.set(false);
  }
}
