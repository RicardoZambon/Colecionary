import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ImageFocusService } from '../../core/state/image-focus.service';
import { VaultStore } from '../../core/state/vault.store';
import { UiImageFocus, UiToast } from '../../shared/ui';
import { Sidebar } from '../sidebar/sidebar';
import { Topbar } from '../topbar/topbar';

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Topbar, Sidebar, UiToast, UiImageFocus],
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
    <ui-image-focus />
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
  private readonly focus = inject(ImageFocusService);

  constructor() {
    // A failed load mid-session (e.g. expired token) is handled by the auth
    // interceptor, which logs out and redirects — nothing to do here.
    this.store.load().catch(() => undefined);
    // Framing is cosmetic: if it fails to load, every image just renders
    // centred, which is exactly the pre-framing behaviour. Never block the app.
    this.focus.load().catch(() => undefined);
  }
}
