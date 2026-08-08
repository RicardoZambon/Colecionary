import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { UiButton, UiCard, UiField, UiIcon, UiTextInput } from '../../shared/ui';

@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiButton, UiCard, UiField, UiIcon, UiTextInput],
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
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
      this.error.set(messageFor(err));
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
function messageFor(err: unknown): string {
  const status = (err as { status?: number })?.status;
  if (status === 401) {
    return 'Invalid email or password.';
  }
  if (status === 429) {
    return 'Too many sign-in attempts. Wait a few minutes, then try again.';
  }
  // Angular reports an unreachable server (offline, DNS, refused, CORS) as 0.
  if (!status) {
    return 'Can’t reach the Vault server. Check that it’s running, then try again.';
  }
  if (status >= 500) {
    return 'The Vault server hit an error while signing you in. Try again in a moment.';
  }
  return `Sign-in failed (HTTP ${status}). Try again, or check the server logs.`;
}
