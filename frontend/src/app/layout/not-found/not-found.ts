import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { I18nService } from '../../core/i18n';
import { TPipe } from '../../shared/pipes/t.pipe';
import { UiButton } from '../../shared/ui/button/button';
import { UiEmpty } from '../../shared/ui/empty/empty';

/**
 * The address the app could not open.
 *
 * `{ path: '**', redirectTo: 'dashboard' }` used to answer every unrecognised
 * URL — a stale bookmark, a shared link with a typo, a route removed in a later
 * version — by rendering the dashboard and *rewriting the address bar*. So the
 * user believed the navigation had worked, concluded the content had been
 * deleted, and could not even recover the URL to retry or report it. Rendering
 * a page instead keeps both the failure and the address visible.
 *
 * It lives under `Shell`, which is deliberate on two counts: the nav is still
 * there to leave by, and the route keeps the shell's `authGuard`, so an
 * unknown URL reached while signed out still goes to the sign-in screen rather
 * than announcing which paths do not exist.
 */
@Component({
  selector: 'app-not-found',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TPipe, UiButton, UiEmpty],
  template: `
    <ui-empty icon="search" [title]="'shell.notFound.title' | t" [body]="body()">
      <div emptyActions>
        <ui-button variant="primary" routerLink="/dashboard">{{ 'nav.dashboard' | t }}</ui-button>
        <ui-button variant="ghost" routerLink="/store">{{ 'nav.store' | t }}</ui-button>
      </div>
    </ui-empty>
  `,
  styles: `
    :host {
      display: block;
      padding: var(--sp-8) var(--sp-6);
      max-width: 720px;
    }
  `,
})
export class NotFound {
  private readonly router = inject(Router);
  private readonly i18n = inject(I18nService);

  /**
   * Names the address, because that is the one fact the user needs and the one
   * the redirect used to destroy. Read once, from the URL that produced this
   * page — nothing here navigates, so it cannot go stale.
   */
  protected readonly body = computed(() =>
    this.i18n.t('shell.notFound.body', { url: this.router.url }),
  );
}
