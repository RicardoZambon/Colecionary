import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { I18nService, MessageKey } from '../../core/i18n';
import { SetupService } from '../../core/setup/setup.service';
import { SetupTestResult } from '../../core/models/setup.model';
import { ThemeId } from '../../core/models';
import { ThemeService } from '../../core/state/theme.service';
import { TPipe } from '../../shared/pipes/t.pipe';
import {
  UiButton,
  UiCard,
  UiField,
  UiIcon,
  UiSelect,
  UiTextInput,
  UiToggle,
} from '../../shared/ui';
import { SelectOption } from '../../shared/ui/select/select';
import {
  CurrencyCode,
  FALLBACK_CURRENCY,
  SUPPORTED_CURRENCIES,
  currencyLabel,
  isCurrencyCode,
} from '../../core/utils/money.util';

/** A message shown to the user, with the tone that colors its border. */
interface Note {
  tone: 'ok' | 'bad';
  text: string;
}

@Component({
  selector: 'app-setup-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe, UiButton, UiCard, UiField, UiIcon, UiSelect, UiTextInput, UiToggle],
  templateUrl: './setup-page.html',
  styleUrl: './setup-page.scss',
})
export class SetupPage {
  private readonly setup = inject(SetupService);
  protected readonly i18n = inject(I18nService);
  /**
   * The wizard runs outside the app shell, so nothing else would apply a theme
   * here. Injecting the service restores `data-theme` on <html> and lets the
   * Preferences step preview the choice live.
   */
  private readonly theme = inject(ThemeService);

  protected readonly stepKeys: MessageKey[] = [
    'setup.step.token',
    'setup.step.database',
    'setup.step.administrator',
    'setup.step.preferences',
    'setup.step.review',
  ];
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
  // Theme names are proper nouns, so this list needs no translation — but the
  // review step below reads a label out of it, so it stays a SelectOption[].
  protected readonly themeOptions: SelectOption[] = this.theme.themes.map(t => ({ value: t.id, label: t.name }));

  protected readonly defaultCurrency = signal<CurrencyCode>(FALLBACK_CURRENCY);
  // Locale-sorted like every other currency picker; the wizard runs before any
  // vault exists, so this is the only place the first choice can be made.
  protected readonly currencyOptions = computed<SelectOption[]>(() => {
    const locale = this.i18n.locale();
    return SUPPORTED_CURRENCIES.map(code => ({ value: code, label: currencyLabel(code, locale) })).sort(
      (a, b) => a.label.localeCompare(b.label, locale),
    );
  });

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
    const params = {
      target: `${this.server().trim()},${Number(this.port()) || 1433}`,
      database: this.database().trim(),
    };
    const say = (tone: Note['tone'], key: MessageKey): Note => ({
      tone,
      text: this.i18n.t(key, params),
    });
    switch (result) {
      case 'Success':
        return say('ok', 'setup.test.success');
      case 'DatabaseMissingButCanBeCreated':
        return say('ok', 'setup.test.willCreate');
      case 'DatabaseMissingAndCannotCreate':
        return say('bad', 'setup.test.cannotCreate');
      case 'LoginRejected':
        return say('bad', 'setup.test.loginRejected');
      case 'HostUnreachable':
        return say('bad', 'setup.test.unreachable');
      default:
        return say('bad', 'setup.test.unknown');
    }
  });

  protected pickCurrency(code: string): void {
    if (isCurrencyCode(code)) this.defaultCurrency.set(code);
  }

  /** Previews the theme as it's picked; `finish()` persists the final choice. */
  protected pickTheme(id: string): void {
    this.defaultTheme.set(id as ThemeId);
    this.theme.current.set(id as ThemeId);
  }

  protected next(): void {
    this.error.set(null);
    this.step.update(s => Math.min(s + 1, this.stepKeys.length - 1));
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
      this.error.set(this.messageFrom(err) ?? this.i18n.t('setup.error.testFailed'));
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
        defaultCurrency: this.defaultCurrency(),
      });

      // Persist the choice for this browser so the sign-in screen matches.
      this.theme.apply(this.defaultTheme());

      const ready = await this.setup.waitUntilConfigured();
      if (ready) {
        window.location.href = '/';
      } else {
        this.error.set(this.i18n.t('setup.error.notBackOnline'));
      }
    } catch (err) {
      this.error.set(this.messageFrom(err) ?? this.i18n.t('setup.error.applyFailed'));
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
      return this.i18n.t('setup.error.badToken');
    }
    if (response?.status === 429) {
      return this.i18n.t('setup.error.rateLimited');
    }
    // Status 0 means the request never reached the server (offline / CORS / down).
    if (!response?.status) {
      return this.i18n.t('setup.error.unreachable');
    }
    return null;
  }
}
