import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';

import { I18nService, MessageKey } from '../../core/i18n';
import { SetupService } from '../../core/setup/setup.service';
import { SetupTestResult } from '../../core/models/setup.model';
import { ThemeId } from '../../core/models';
import { ThemeService } from '../../core/state/theme.service';
import { LangPicker } from '../../layout/lang-picker/lang-picker';
import { TPipe } from '../../shared/pipes/t.pipe';
import { UiButton } from '../../shared/ui/button/button';
import { UiCard } from '../../shared/ui/card/card';
import { UiField } from '../../shared/ui/field/field';
import { UiIcon } from '../../shared/ui/icon/icon';
import { SelectOption, UiSelect } from '../../shared/ui/select/select';
import { UiTextInput } from '../../shared/ui/text-input/text-input';
import { UiToggle } from '../../shared/ui/toggle/toggle';
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
  imports: [LangPicker, TPipe, UiButton, UiCard, UiField, UiIcon, UiSelect, UiTextInput, UiToggle],
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
  private readonly injector = inject(Injector);

  private readonly stepPanel = viewChild<ElementRef<HTMLElement>>('stepPanel');
  private readonly firstField = viewChild<UiTextInput>('firstField');

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

  /**
   * Whether the user has tried to leave this step yet.
   *
   * Nothing is marked wrong before they have. Reset on every step change, so
   * arriving at the next screen never opens with a page of refusals for fields
   * nobody has reached — and a value corrected after the attempt clears its own
   * message, because the message is derived rather than stored.
   */
  private readonly attempted = signal(false);

  /** "Fill this in to continue", but only once Next has actually been pressed. */
  protected fieldError(valid: boolean): string {
    return this.attempted() && !valid ? this.i18n.t('setup.required') : '';
  }

  protected readonly passwordError = computed(() => {
    if (this.ownerPassword() && this.ownerPassword().length < 8) {
      return this.i18n.t('setup.admin.passwordTooShort');
    }
    return this.fieldError(this.ownerPassword().length >= 8);
  });

  protected readonly confirmError = computed(() => {
    if (this.ownerPasswordConfirm() && this.ownerPassword() !== this.ownerPasswordConfirm()) {
      return this.i18n.t('setup.admin.passwordMismatch');
    }
    return this.fieldError(this.ownerPassword() === this.ownerPasswordConfirm());
  });

  /** Whether the step on screen is complete enough to leave. */
  private stepValid(): boolean {
    switch (this.step()) {
      case 0:
        return this.tokenValid();
      case 1:
        return this.dbValid() && this.tokenValid();
      case 2:
        return this.adminValid();
      default:
        return true;
    }
  }

  /** The `<li>` a step's panel is named by, so the group carries a real label. */
  protected stepLabelId(index: number): string {
    return `setup-step-${index}`;
  }

  /** "Step 3 of 5 — Administrator", for the live region. */
  protected readonly stepAnnounce = computed(() =>
    this.i18n.t('setup.stepAnnounce', {
      n: this.step() + 1,
      total: this.stepKeys.length,
      name: this.i18n.t(this.stepKeys[this.step()]),
    }),
  );

  /** The currency's localized name, for the review step. */
  protected readonly currencyName = computed(() =>
    currencyLabel(this.defaultCurrency(), this.i18n.locale()),
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

  /**
   * Advances, or says what is missing.
   *
   * The button stays live on purpose: a control that goes dead can only ever
   * withhold the outcome, while one that reports can explain itself. The first
   * refused field takes focus so the answer is where the caret is.
   */
  protected next(): void {
    this.error.set(null);
    if (!this.stepValid()) {
      this.attempted.set(true);
      this.error.set(this.i18n.t('setup.fixFirst'));
      this.focusStep({ field: true });
      return;
    }
    this.attempted.set(false);
    this.step.update(s => Math.min(s + 1, this.stepKeys.length - 1));
    this.focusStep();
  }

  protected back(): void {
    this.error.set(null);
    this.attempted.set(false);
    this.step.update(s => Math.max(s - 1, 0));
    this.focusStep();
  }

  /**
   * Moves focus into the step that is now showing.
   *
   * Without this the panel swapped under an unmoved cursor: focus stayed on
   * Next, so a keyboard user had to Shift+Tab backwards to reach the new step's
   * first field and a screen reader was told nothing had changed. Not the
   * `autofocus` attribute — it is honoured only on initial document load and
   * does nothing to content inserted later.
   *
   * The group rather than the field by default: landing on the panel lets the
   * hint above the fields be read first, which is where the step explains
   * itself. A *refusal* focuses the field, because there the user has to type.
   */
  private focusStep(options: { field?: boolean } = {}): void {
    afterNextRender(
      () => {
        if (options.field && this.firstField()) this.firstField()!.focus();
        else this.stepPanel()?.nativeElement.focus({ preventScroll: true });
      },
      { injector: this.injector },
    );
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

  /** True once the wait has been going long enough to need reassuring. */
  protected readonly slow = signal(false);

  protected async finish(): Promise<void> {
    if (this.busy()) {
      return;
    }
    if (!this.adminValid()) {
      // The review step has no fields of its own, so the refusal points back at
      // the one that does rather than marking nothing.
      this.error.set(this.i18n.t('setup.fixFirst'));
      this.attempted.set(true);
      this.step.set(2);
      this.focusStep({ field: true });
      return;
    }
    this.busy.set(true);
    this.slow.set(false);
    this.error.set(null);
    // Reloading here loses the whole wizard: none of it is persisted, and the
    // one thing the screen used to say was the word "Applying…".
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
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

      // Roughly thirty seconds in, the message changes rather than the screen
      // staying identical for a minute and a half.
      const ready = await this.setup.waitUntilConfigured({
        onPoll: attempt => this.slow.set(attempt >= 15),
      });
      if (ready) {
        window.location.href = '/';
      } else {
        this.error.set(this.i18n.t('setup.error.notBackOnline'));
      }
    } catch (err) {
      this.error.set(this.messageFrom(err) ?? this.i18n.t('setup.error.applyFailed'));
    } finally {
      window.removeEventListener('beforeunload', warn);
      this.busy.set(false);
      this.slow.set(false);
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
