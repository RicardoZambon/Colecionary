import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

export interface TabDef {
  id: string;
  label: string;
}

@Component({
  selector: 'ui-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tabs" role="tablist">
      @for (tab of tabs(); track tab.id) {
        <button
          type="button"
          role="tab"
          class="tab"
          [class.active]="tab.id === active()"
          [attr.aria-selected]="tab.id === active()"
          (click)="active.set(tab.id)"
        >
          {{ tab.label }}
        </button>
      }
    </div>
  `,
  styles: `
    .tabs {
      display: flex;
      gap: 2px;
      border-bottom: var(--bw) solid var(--border);
    }

    .tab {
      background: none;
      border: none;
      padding: 8px 16px;
      font-size: 12.5px;
      font-weight: 600;
      font-family: var(--font-body);
      cursor: pointer;
      color: var(--muted);
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;

      &:hover {
        color: var(--text);
      }

      &.active {
        color: var(--accent);
        border-bottom-color: var(--accent);
      }
    }
  `,
})
export class UiTabs {
  readonly tabs = input.required<TabDef[]>();
  readonly active = model.required<string>();
}
