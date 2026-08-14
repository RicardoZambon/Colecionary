import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { I18nService, MessageKey } from '../../core/i18n';
import { TPipe } from '../../shared/pipes/t.pipe';
import { UiButton, UiCard, UiField, UiIcon, UiTextInput } from '../../shared/ui';

@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe, UiButton, UiCard, UiField, UiIcon, UiTextInput],
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly i18n = inject(I18nService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submit(): Promise<void> {
    if (this.busy()) return;
    this.error.set(null);
    this.busy.set(true);
    try {
      await this.auth.login(this.email().trim(), this.password());
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/dashboard';
      await this.router.navigateByUrl(returnUrl);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      this.error.set(this.i18n.t(errorKeyFor(status), { status: status ?? 0 }));
    } finally {
      this.busy.set(false);
    }
  }
}

/**
 * Only a 401 actually means the credentials were wrong. Everything else — the
 * API being down, a crash, rate limiting — used to be reported as "Invalid
 * email or password", which sends people off retyping a correct password.
 */
function errorKeyFor(status: number | undefined): MessageKey {
  if (status === 401) {
    return 'login.error.credentials';
  }
  if (status === 429) {
    return 'login.error.rateLimited';
  }
  // Angular reports an unreachable server (offline, DNS, refused, CORS) as 0.
  if (!status) {
    return 'login.error.unreachable';
  }
  return status >= 500 ? 'login.error.server' : 'login.error.other';
}
