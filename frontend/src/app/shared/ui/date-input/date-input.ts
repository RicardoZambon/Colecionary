import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  model,
  output,
} from '@angular/core';

import { I18nService } from '../../../core/i18n';

let nextId = 0;

/**
 * A date field that agrees with the language the app is in.
 *
 * A bare `<input type="date">` follows the **browser's** locale, not the
 * document's. So a Brazilian reading the app in Portuguese was shown
 * `mm/dd/yyyy` by an English-locale Chrome and typed into it as if it were
 * `dd/mm` — which does not fail, it silently records the wrong date. An
 * acquisition date is exactly the field nobody re-reads afterwards.
 *
 * Two things are done about it, because one is not enough:
 *
 * 1. `lang` is bound to the active language. Chromium honours it for date
 *    fields; Firefox and Safari still take the OS locale. So this fixes the
 *    common case and cannot be relied on.
 * 2. **The expected order is printed under the field**, derived from
 *    `Intl.DateTimeFormat` for `I18nService.locale()` rather than hardcoded, and
 *    wired up as `aria-describedby` so it is announced and not merely drawn.
 *    This is the part that holds in every browser: whatever order the control
 *    renders in, the user has been told which one it is.
 *
 * The model is always an ISO `yyyy-MM-dd` string — what the native control
 * reads and writes, what the DTO carries, and independent of any display
 * format. Empty string means "no date", so a cleared field round-trips as the
 * `null` the API wants without this component knowing about `null`.
 */
@Component({
  selector: 'ui-date-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <input
      type="date"
      [lang]="i18n.current()"
      [value]="value()"
      [attr.min]="min() || null"
      [attr.max]="max() || null"
      [attr.aria-label]="ariaLabel() || null"
      [attr.aria-describedby]="hintId"
      [class.subtle]="variant() === 'subtle'"
      (input)="onInput($event)"
      (blur)="blurred.emit()"
    />
    <span class="hint" [id]="hintId">{{ pattern() }}</span>
  `,
  styles: `
    :host {
      display: block;
    }

    input {
      width: 100%;
      background: var(--panel);
      border: var(--bw) solid var(--border);
      color: var(--text);
      border-radius: var(--radius);
      padding: 8px 12px;
      font-family: var(--font-body);
      font-size: var(--fs-md);
      /* No 'outline: none' — see the note in ui-text-input. The scoped rule
         would outrank the global focus ring and leave the field with none. */

      &.subtle {
        background: var(--panel2);
      }
    }

    .hint {
      display: block;
      margin-top: 3px;
      font-family: var(--font-mono);
      font-size: 9.5px;
      letter-spacing: 0.06em;
      color: var(--muted);
    }
  `,
})
export class UiDateInput {
  protected readonly i18n = inject(I18nService);

  /** ISO `yyyy-MM-dd`; `''` means no date. */
  readonly value = model('');
  /** ISO bounds, passed straight to the native control. `''` means unbounded. */
  readonly min = input('');
  readonly max = input('');
  readonly variant = input<'panel' | 'subtle'>('panel');
  /**
   * Accessible name, for a field the page labels by proximity. Has to be an
   * input for the same reason `ui-text-input` needs one: written at the usage
   * site it would land on the `<ui-date-input>` wrapper, which is not the
   * focusable thing.
   */
  readonly ariaLabel = input('');
  readonly blurred = output<void>();

  protected readonly hintId = `date-hint-${nextId++}`;

  /**
   * The field's order in the active locale — `dd/mm/aaaa`, `mm/dd/yyyy` — built
   * from `Intl`'s own part order and separators, so a new language gets the
   * right pattern without anyone writing one down. The letters themselves are
   * copy (Portuguese spells a year `aaaa`), so they come from the dictionary.
   */
  protected readonly pattern = computed(() => {
    const day = this.i18n.t('ui.dateInput.day');
    const month = this.i18n.t('ui.dateInput.month');
    const year = this.i18n.t('ui.dateInput.year');
    const letters = new Map([
      ['day', day],
      ['month', month],
      ['year', year],
    ]);
    try {
      return new Intl.DateTimeFormat(this.i18n.locale(), {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
        .formatToParts(new Date(Date.UTC(2026, 0, 31)))
        .map(part => letters.get(part.type) ?? part.value)
        .join('');
    } catch {
      // A locale Intl cannot resolve is not a reason to render nothing.
      return [year, month, day].join('-');
    }
  });

  protected onInput(event: Event): void {
    this.value.set((event.target as HTMLInputElement).value);
  }
}
