import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { I18nService, MessageKey } from '../../core/i18n';
import { LangPicker } from '../../layout/lang-picker/lang-picker';
import { TPipe } from '../../shared/pipes/t.pipe';
import { UiButton } from '../../shared/ui/button/button';
import { UiCard } from '../../shared/ui/card/card';
import { UiField } from '../../shared/ui/field/field';
import { UiIcon } from '../../shared/ui/icon/icon';
import { UiTextInput } from '../../shared/ui/text-input/text-input';

@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LangPicker, TPipe, UiButton, UiCard, UiField, UiIcon, UiTextInput],
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly i18n = inject(I18nService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /**
   * Whether the last session ended by itself rather than by choice.
   *
   * `AuthService.sessionExpired()` puts it in the query string; a deliberate
   * `logout()` does not, so a sign-out is never accused of expiring.
   */
  protected readonly expired = signal(
    this.route.snapshot.queryParamMap.get('expired') === '1',
  );

  private readonly emailInput = viewChild<UiTextInput>('emailInput');

  constructor() {
    // Explicitly, and after render: this is the one field on the screen, and
    // every sign-in used to start with a click. `autofocus` is not an option —
    // it is honoured only on initial document load, and reaching /login is a
    // router navigation.
    afterNextRender(() => this.emailInput()?.focus());
  }

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
      // The notice described the session that just ended; it must not survive
      // into the next screen if the navigation is slow.
      this.expired.set(false);
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
