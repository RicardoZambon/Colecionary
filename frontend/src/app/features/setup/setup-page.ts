import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { SetupService } from '../../core/setup/setup.service';
import { THEMES } from '../../core/state/themes';
import { UiButton, UiCard, UiField, UiSelect, UiTextInput, UiToggle } from '../../shared/ui';
import { SelectOption } from '../../shared/ui/select/select';

const THEME_STORAGE_KEY = 'vault.theme';

@Component({
  selector: 'app-setup-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiButton, UiCard, UiField, UiSelect, UiTextInput, UiToggle],
  templateUrl: './setup-page.html',
  styleUrl: './setup-page.scss',
})
export class SetupPage {
  private readonly setup = inject(SetupService);

  protected readonly steps = ['Token', 'Database', 'Administrator', 'Preferences', 'Review'];
  protected readonly step = signal(0);

  // Token
  protected readonly token = signal('');

  // Database
  protected readonly server = signal('');
  protected readonly port = signal('1433');
  protected readonly database = signal('Colecionary');
  protected readonly username = signal('');
  protected readonly password = signal('');
  protected readonly trustCert = signal(true);
  protected readonly testing = signal(false);
  protected readonly testResult = signal<string | null>(null);

  // Administrator
  protected readonly organizationName = signal('');
  protected readonly ownerName = signal('');
  protected readonly ownerEmail = signal('');
  protected readonly ownerPassword = signal('');
  protected readonly ownerPasswordConfirm = signal('');

  // Preferences
  protected readonly defaultTheme = signal('devlight');
  protected readonly themeOptions: SelectOption[] = THEMES.map(t => ({ value: t.id, label: t.name }));

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly tokenValid = computed(() => this.token().trim().length > 0);

  protected readonly dbValid = computed(
    () => this.server().trim().length > 0 && this.database().trim().length > 0 && this.username().trim().length > 0,
  );

  protected readonly adminValid = computed(
    () =>
      this.organizationName().trim().length > 0 &&
      this.ownerName().trim().length > 0 &&
      this.ownerEmail().trim().length > 0 &&
      this.ownerPassword().length >= 8 &&
      this.ownerPassword() === this.ownerPasswordConfirm(),
  );

  protected next(): void {
    this.error.set(null);
    this.step.update(s => Math.min(s + 1, this.steps.length - 1));
  }

  protected back(): void {
    this.error.set(null);
    this.step.update(s => Math.max(s - 1, 0));
  }

  protected async test(): Promise<void> {
    if (this.testing()) {
      return;
    }
    this.testing.set(true);
    this.testResult.set(null);
    this.error.set(null);
    try {
      this.testResult.set(await this.setup.testConnection(this.token().trim(), this.connection()));
    } catch (err) {
      this.error.set(this.messageFrom(err) ?? 'Could not reach the server. Check the token and fields.');
    } finally {
      this.testing.set(false);
    }
  }

  protected async finish(): Promise<void> {
    if (this.busy() || !this.adminValid()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.setup.apply({
        token: this.token().trim(),
        ...this.connection(),
        organizationName: this.organizationName().trim(),
        ownerEmail: this.ownerEmail().trim(),
        ownerName: this.ownerName().trim(),
        ownerPassword: this.ownerPassword(),
        defaultTheme: this.defaultTheme(),
      });

      // Apply the chosen theme immediately for this browser.
      try {
        localStorage.setItem(THEME_STORAGE_KEY, this.defaultTheme());
      } catch {
        // Non-fatal — the theme just won't pre-apply.
      }

      const ready = await this.setup.waitUntilConfigured();
      if (ready) {
        window.location.href = '/';
      } else {
        this.error.set('Setup applied, but the app did not come back online. Reload the page to continue.');
      }
    } catch (err) {
      this.error.set(this.messageFrom(err) ?? 'Setup failed. Check the fields and try again.');
    } finally {
      this.busy.set(false);
    }
  }

  private connection() {
    return {
      server: this.server().trim(),
      port: Number(this.port()) || 1433,
      database: this.database().trim(),
      username: this.username().trim(),
      password: this.password(),
      trustServerCertificate: this.trustCert(),
    };
  }

  private messageFrom(err: unknown): string | null {
    const response = err as { status?: number; error?: { errors?: Record<string, string[]>; title?: string } };
    if (response?.error?.errors) {
      return Object.values(response.error.errors).flat().join(' ');
    }
    if (response?.error?.title) {
      return response.error.title;
    }
    if (response?.status === 401) {
      return 'Invalid setup token.';
    }
    if (response?.status === 429) {
      return 'Too many attempts. Wait a few minutes and try again.';
    }
    return null;
  }
}
