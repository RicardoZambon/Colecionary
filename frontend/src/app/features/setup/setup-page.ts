import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { SetupService } from '../../core/setup/setup.service';
import { SetupTestResult } from '../../core/models/setup.model';
import { ThemeId } from '../../core/models';
import { ThemeService } from '../../core/state/theme.service';
import { UiButton, UiCard, UiField, UiSelect, UiTextInput, UiToggle } from '../../shared/ui';
import { SelectOption } from '../../shared/ui/select/select';

/** A message shown to the user, with the tone that colors its border. */
interface Note {
  tone: 'ok' | 'bad';
  text: string;
}

@Component({
  selector: 'app-setup-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiButton, UiCard, UiField, UiSelect, UiTextInput, UiToggle],
  templateUrl: './setup-page.html',
  styleUrl: './setup-page.scss',
})
export class SetupPage {
  private readonly setup = inject(SetupService);
  /**
   * The wizard runs outside the app shell, so nothing else would apply a theme
   * here. Injecting the service restores `data-theme` on <html> and lets the
   * Preferences step preview the choice live.
   */
  private readonly theme = inject(ThemeService);

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
  protected readonly testResult = signal<SetupTestResult | null>(null);

  // Administrator
  protected readonly organizationName = signal('');
  protected readonly ownerName = signal('');
  protected readonly ownerEmail = signal('');
  protected readonly ownerPassword = signal('');
  protected readonly ownerPasswordConfirm = signal('');

  // Preferences
  protected readonly defaultTheme = signal<ThemeId>(this.theme.current());
  protected readonly themeOptions: SelectOption[] = this.theme.themes.map(t => ({ value: t.id, label: t.name }));

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

  /** Theme ids are storage keys; the review step shows the human name. */
  protected readonly themeLabel = computed(
    () => this.themeOptions.find(option => option.value === this.defaultTheme())?.label ?? this.defaultTheme(),
  );

  /**
   * Turns the backend's `DatabaseConnectionResult` enum into something a person
   * can act on. The raw name (`HostUnreachable`) says nothing about what to fix.
   */
  protected readonly testNote = computed<Note | null>(() => {
    const result = this.testResult();
    if (!result) {
      return null;
    }
    const target = `${this.server().trim()},${Number(this.port()) || 1433}`;
    switch (result) {
      case 'Success':
        return { tone: 'ok', text: `Connected to ${target}. The database “${this.database().trim()}” is ready to use.` };
      case 'DatabaseMissingButCanBeCreated':
        return {
          tone: 'ok',
          text: `Connected to ${target}. The database “${this.database().trim()}” doesn't exist yet — it will be created for you when you finish setup.`,
        };
      case 'DatabaseMissingAndCannotCreate':
        return {
          tone: 'bad',
          text: `Connected to ${target}, but the database “${this.database().trim()}” doesn't exist and this login isn't allowed to create it. Create the database first, or use a login with the dbcreator role.`,
        };
      case 'LoginRejected':
        return {
          tone: 'bad',
          text: `${target} refused this username and password. Check the credentials, and make sure the server allows SQL Server authentication (not Windows-only).`,
        };
      case 'HostUnreachable':
        return {
          tone: 'bad',
          text: `Couldn't reach a SQL Server at ${target}. Check the host name and port, that the server is running and accepting TCP connections, and that no firewall is in the way.`,
        };
      default:
        return { tone: 'bad', text: `The connection to ${target} failed for an unrecognized reason. Double-check the details and try again.` };
    }
  });

  /** Previews the theme as it's picked; `finish()` persists the final choice. */
  protected pickTheme(id: string): void {
    this.defaultTheme.set(id as ThemeId);
    this.theme.current.set(id as ThemeId);
  }

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
      this.error.set(this.messageFrom(err) ?? 'The connection test couldn’t run. Check the token and the fields above, then try again.');
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

      // Persist the choice for this browser so the sign-in screen matches.
      this.theme.apply(this.defaultTheme());

      const ready = await this.setup.waitUntilConfigured();
      if (ready) {
        window.location.href = '/';
      } else {
        this.error.set('Setup was applied, but the app hasn’t come back online yet. Give it a moment and reload the page.');
      }
    } catch (err) {
      this.error.set(this.messageFrom(err) ?? 'Setup couldn’t be applied. Check the details on the previous steps and try again.');
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
      return 'That setup token wasn’t accepted. Copy it again from the container log line that starts with “SETUP MODE”.';
    }
    if (response?.status === 429) {
      return 'Too many attempts. Wait a few minutes, then try again.';
    }
    // Status 0 means the request never reached the server (offline / CORS / down).
    if (!response?.status) {
      return 'Couldn’t reach the Vault server. Check that the container is still running, then try again.';
    }
    return null;
  }
}
