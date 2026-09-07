import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { I18nService } from '../../core/i18n';
import { TPipe } from '../../shared/pipes/t.pipe';
import { UiDropdown } from '../../shared/ui/dropdown/dropdown';
import { UiFlag } from '../../shared/ui/flag/flag';
import { UiIcon } from '../../shared/ui/icon/icon';

/**
 * The language menu, as app chrome rather than as part of the top bar.
 *
 * It was written inline in `topbar.html`, which put it inside `Shell` — and
 * `/login` and `/setup` are rendered *outside* the shell. So the two screens a
 * Portuguese-speaking user meets first, one of which is an eleven-field
 * database-and-owner wizard, were the only two with no way to change the
 * language: a browser reporting `en-US` got English and could not correct it
 * until after signing in. This lives in `layout/` beside `app-conflict-notice`
 * for the same reason that one does — it is chrome, not a reusable element, so
 * it belongs here and not in `shared/ui`.
 *
 * The trigger carries `aria-expanded` and `aria-controls` from `ui-dropdown`'s
 * own `open`/`panelId`; without them a screen reader is never told the button
 * opens anything.
 */
@Component({
  selector: 'app-lang-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe, UiDropdown, UiFlag, UiIcon],
  template: `
    <ui-dropdown #menu [width]="180">
      <button
        ddTrigger
        type="button"
        class="trigger"
        [title]="'topbar.language' | t"
        [attr.aria-label]="'topbar.language' | t"
        [attr.aria-haspopup]="true"
        [attr.aria-expanded]="menu.open()"
        [attr.aria-controls]="menu.panelId"
      >
        <ui-flag [lang]="i18n.currentDef.id" [size]="16" />
        <!-- The language's own name, not its locale code. "pt-BR" is a wire
             value; the control beside it is a human one. -->
        <span>{{ i18n.currentDef.name }}</span>
        <ui-icon class="caret" name="chevron-down" [size]="11" />
      </button>
      <ng-container ddPanel>
        @for (lang of i18n.langs; track lang.id) {
          <button
            type="button"
            class="row"
            [attr.aria-current]="lang.id === i18n.current() ? 'true' : null"
            [class.active]="lang.id === i18n.current()"
            (click)="i18n.apply(lang.id); menu.close()"
          >
            <ui-flag [lang]="lang.id" [size]="20" />
            <span class="row__name">{{ lang.name }}</span>
            <span class="row__check">
              @if (lang.id === i18n.current()) {
                <ui-icon name="check" [size]="13" />
              }
            </span>
          </button>
        }
      </ng-container>
    </ui-dropdown>
  `,
  styles: `
    @use '../../../styles/mixins' as *;

    :host {
      display: inline-block;
    }

    .trigger {
      display: flex;
      align-items: center;
      gap: 7px;
      border: var(--bw) solid var(--border);
      background: none;
      border-radius: var(--radius);
      padding: 6px 11px;
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text2);
      cursor: pointer;

      &:hover {
        border-color: var(--accent);
        color: var(--accent);
      }
    }

    /* A caret belongs to the label beside it, not to the next control. */
    .caret {
      margin-left: -3px;
      color: var(--muted-strong);
    }

    .row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border: none;
      border-radius: var(--radius);
      cursor: pointer;
      background: transparent;
      text-align: left;

      &:hover,
      &.active {
        background: var(--panel2);
      }

      &__name {
        flex: 1;
        font-size: 12.5px;
        font-weight: 600;
        color: var(--text);
        font-family: var(--font-body);
      }

      /* Reserved whether or not the tick is drawn, so the rows do not shift
         sideways as the selection moves. */
      &__check {
        display: grid;
        place-items: center;
        width: 13px;
        flex: none;
        color: var(--accent);
      }
    }

    @include upto($bp-lg) {
      .trigger,
      .row {
        min-height: var(--tap);
      }
    }
  `,
})
export class LangPicker {
  protected readonly i18n = inject(I18nService);
}
