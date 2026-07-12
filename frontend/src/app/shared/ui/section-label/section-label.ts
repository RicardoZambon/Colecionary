import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Mono uppercase micro-heading ("COLLECTIONS", "DETAILS", …). */
@Component({
  selector: 'ui-section-label',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  styles: `
    :host {
      display: block;
      font-family: var(--font-mono);
      font-size: 10.5px;
      letter-spacing: 0.13em;
      color: var(--muted);
      text-transform: uppercase;
    }
  `,
})
export class UiSectionLabel {}
