import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { VaultStore } from '../../core/state/vault.store';
import { UiToast } from '../../shared/ui';
import { Sidebar } from '../sidebar/sidebar';
import { Topbar } from '../topbar/topbar';

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Topbar, Sidebar, UiToast],
  template: `
    <app-topbar />
    <div class="body">
      <app-sidebar />
      <main class="main">
        @if (store.loaded()) {
          <router-outlet />
        } @else {
          <div class="loading">Loading your vault…</div>
        }
      </main>
    </div>
    <ui-toast />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }

    .body {
      display: flex;
      flex: 1;
      min-height: 0;
    }

    .main {
      flex: 1;
      min-width: 0;
      overflow-y: auto;
    }

    .loading {
      padding: 40px;
      color: var(--muted);
      font-size: 13px;
    }
  `,
})
export class Shell {
  protected readonly store = inject(VaultStore);

  constructor() {
    void this.store.load();
  }
}
