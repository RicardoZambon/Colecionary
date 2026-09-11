import { HttpErrorResponse } from '@angular/common/http';
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
  UiSkeleton,
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

/**
 * The two probe outcomes that let the wizard move on.
 *
 * "The database does not exist yet" is a **pass**: `apply` runs the migration
 * that creates it, and a fresh empty server is the commonest first run there
 * is. Everything else is a connection that will not work, and the wizard's
 * entire job is provisioning that database.
 */
const PASSING_PROBES: readonly SetupTestResult[] = ['Success', 'DatabaseMissingButCanBeCreated'];

@Component({
  selector: 'app-setup-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe, UiButton, UiCard, UiField, UiIcon, UiSelect, UiSkeleton, UiTextInput, UiToggle],
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
  /**
   * High-water mark of where the wizard has been.
   *
   * Needed only because the step list is navigable now. "Done" used to be
   * `i < step()`, which is the same thing while the only movement is forwards;
   * jump back to Database from Review and three finished steps would wear the
   * not-yet grey while their buttons were plainly enabled — an available
   * control painted as unavailable.
   */
  private readonly visited = signal(0);

  // Token
  protected readonly token = signal('');

  // Database
  protected readonly server = signal('');
  protected readonly port = signal('1433');
  protected readonly database = signal('Colecionary');
  protected readonly username = signal('');
  protected readonly password = signal('');
  /**
   * Off by default, and deliberately so.
   *
   * `SqlConnectionStringBuilder` encrypts by default, so trusting the server's
   * certificate means "accept whatever certificate answers" — a security
   * decision, and the one thing in this wizard that a permissive default would
   * make invisibly. A self-signed certificate (the containerised SQL Server the
   * deployment guide describes) does need it, which is why the connection test
   * is now mandatory: the refusal happens at this field, next to the toggle
   * that fixes it, rather than at Finish or never.
   */
  protected readonly trustCert = signal(false);
  protected readonly testing = signal(false);
  protected readonly testResult = signal<SetupTestResult | null>(null);
  /**
   * The connection the last answered probe was taken against.
   *
   * This is what expires a pass without anything having to remember to expire
   * it: the fingerprint is derived from the fields, so editing any of them
   * makes it stop matching, `dbProven` goes false and the note — which
   * interpolates the *live* server and database names — stops being shown
   * describing a host nobody tested.
   */
  private readonly probedConnection = signal<string | null>(null);

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

  /** Everything the last probe was told, as one comparable string. */
  private readonly connectionKey = computed(() => JSON.stringify(this.connection()));

  /** True only while the fields still spell the connection that was probed. */
  private readonly probeFresh = computed(
    () => this.probedConnection() !== null && this.probedConnection() === this.connectionKey(),
  );

  /**
   * A connection that answered, for the details currently on screen.
   *
   * The test used to be optional, so you could walk three more steps on a
   * database that does not exist and find out at Finish — which re-checked only
   * `adminValid`. Provisioning that database is the entire point of the wizard,
   * so this now gates Next, the step list and Finish alike.
   */
  protected readonly dbProven = computed(() => {
    const result = this.testResult();
    return this.probeFresh() && result !== null && PASSING_PROBES.includes(result);
  });

  protected readonly adminValid = computed(
    () =>
      this.organizationName().trim().length > 0 &&
      this.ownerName().trim().length > 0 &&
      this.ownerEmail().trim().length > 0 &&
      this.ownerPassword().length >= 8 &&
      this.ownerPassword() === this.ownerPasswordConfirm(),
  );

  /**
   * What each step demands before the wizard will leave it. Preferences and
   * Review ask nothing, so a reader who got that far can move freely.
   */
  private readonly gates = computed<readonly boolean[]>(() => [
    this.tokenValid(),
    this.dbValid() && this.dbProven(),
    this.adminValid(),
    true,
    true,
  ]);

  /**
   * The furthest step that may be opened: every gate up to it is satisfied.
   *
   * Breaking an earlier step pulls this back, which is what stops the step list
   * from being a way around the Next button — clear the server on step 2 and
   * Administrator, Preferences and Review all close again.
   */
  private readonly furthest = computed(() => {
    const gates = this.gates();
    let index = 0;
    while (index < gates.length - 1 && gates[index]) index++;
    return index;
  });

  /** Nothing here writes anything until every step it depends on is answered. */
  protected readonly canFinish = computed(
    () => this.tokenValid() && this.dbValid() && this.dbProven() && this.adminValid(),
  );

  /** Theme ids are storage keys; the review step shows the human name. */
  protected readonly themeLabel = computed(
    () => this.themeOptions.find(option => option.value === this.defaultTheme())?.label ?? this.defaultTheme(),
  );

  /**
   * The currency named the way the step that chose it named it.
   *
   * The review printed the bare ISO code while the picker above it offered
   * localised names, so the one screen whose job is "this is what you chose"
   * was the only one that rendered the choice differently.
   */
  protected readonly currencyName = computed(
    () =>
      this.currencyOptions().find(option => option.value === this.defaultCurrency())?.label ??
      this.defaultCurrency(),
  );

  /**
   * Turns the backend's `DatabaseConnectionResult` enum into something a person
   * can act on. The raw name (`HostUnreachable`) says nothing about what to fix.
   */
  protected readonly testNote = computed<Note | null>(() => {
    const result = this.testResult();
    // Gone the moment a field changes. It interpolates the live server and
    // database, so a note kept across an edit would claim that *this* host
    // answered when what answered was the one typed a keystroke ago.
    if (!result || !this.probeFresh()) {
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
   * Whether the numbered list may open a step.
   *
   * Backwards always: a completed step is reviewable, which is the whole
   * complaint the list existed to answer. Forwards only as far as the gates
   * allow, so the list can never be a way past a step the Next button refuses.
   * The step on screen is always included, so no state can strand the user
   * looking at a chip that says it cannot be opened.
   */
  protected canOpen(index: number): boolean {
    return index <= this.furthest() || index === this.step();
  }

  /**
   * A step that has been filled in and still holds.
   *
   * Both halves matter: without `visited` a step you have not reached yet would
   * go green the moment the one before it passed, and without `canOpen` a step
   * you completed and then invalidated from an earlier one would stay green
   * while refusing to open.
   */
  protected isDone(index: number): boolean {
    return index !== this.step() && index < this.visited() && this.canOpen(index);
  }

  protected goTo(index: number): void {
    if (this.busy() || !this.canOpen(index)) {
      return;
    }
    this.error.set(null);
    this.step.set(index);
    this.visited.update(seen => Math.max(seen, index));
  }

  protected next(): void {
    this.goTo(Math.min(this.step() + 1, this.stepKeys.length - 1));
  }

  protected back(): void {
    this.goTo(Math.max(this.step() - 1, 0));
  }

  protected async test(): Promise<void> {
    if (this.testing()) {
      return;
    }
    // Captured before the request: someone can keep typing while it is in
    // flight, and the answer belongs to the fields it was asked about, not to
    // whatever they say by the time it comes back.
    const probed = this.connectionKey();
    this.testing.set(true);
    this.testResult.set(null);
    this.probedConnection.set(null);
    this.error.set(null);
    try {
      const result = await this.setup.testConnection(this.token().trim(), this.connection());
      this.testResult.set(result);
      this.probedConnection.set(probed);
    } catch (err) {
      this.error.set(this.messageFrom(err) ?? this.i18n.t('setup.error.testFailed'));
    } finally {
      this.testing.set(false);
    }
  }

  protected async finish(): Promise<void> {
    if (this.busy() || !this.canFinish()) {
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

  /**
   * The sentence for a failed request, or null to let the caller's own fallback
   * speak.
   *
   * Two things here are load-bearing, because this wizard runs outside the
   * shell and therefore outside `ui-toast`: the caller's `error()` note is the
   * *only* surface a failure has, so a null and an empty string are not
   * interchangeable. `@if (error(); as message)` treats `''` as nothing to
   * show, so a ProblemDetails carrying an empty `errors` bag or a blank `title`
   * used to clear the button, unset `busy` and say nothing at all. And anything
   * that is not an `HttpErrorResponse` — a bug in this component, a promise
   * that resolved to nothing — is not evidence that the server is unreachable,
   * which is what the old `!response?.status` branch claimed about it.
   */
  private messageFrom(err: unknown): string | null {
    if (!(err instanceof HttpErrorResponse)) {
      return null;
    }
    const body = err.error as { errors?: Record<string, string[]>; title?: string } | null;
    const validation = Object.values(body?.errors ?? {})
      .flat()
      .join(' ');
    if (validation.trim()) {
      return validation;
    }
    if (body?.title?.trim()) {
      return body.title;
    }
    if (err.status === 401) {
      return this.i18n.t('setup.error.badToken');
    }
    if (err.status === 429) {
      return this.i18n.t('setup.error.rateLimited');
    }
    // Status 0 means the request never reached the server (offline / CORS / down).
    if (!err.status) {
      return this.i18n.t('setup.error.unreachable');
    }
    return null;
  }
}
