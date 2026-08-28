import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';

import { ImportPlan } from '../../../core/api/archive-api';
import { I18nService } from '../../../core/i18n';
import { TPipe } from '../../../shared/pipes/t.pipe';
import { UiButton } from '../../../shared/ui';

/**
 * Asks which collections an archive should overwrite.
 *
 * It only ever opens for a real collision: an archive of collections the vault
 * has never seen imports without a word. When it does open it lists every
 * collection in the file, collisions and newcomers alike, because "what is
 * about to happen to my vault" is the question being answered — showing only
 * the conflicts would leave the user guessing about the rest.
 *
 * Overwrite is per collection rather than one switch for the file: a vault
 * backup can hold seven collections where one is worth restoring over and six
 * are not, and a single answer would force the same fate on all of them.
 * Nothing is preselected — overwriting cannot be undone from here, so it is
 * never what a distracted Enter keypress does.
 */
@Component({
  selector: 'app-import-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe, UiButton],
  host: { '(document:keydown)': 'onKeydown($event)' },
  template: `
    @if (plan(); as p) {
      <div class="scrim" (click)="cancelled.emit()"></div>
      <div class="panel" role="dialog" aria-modal="true" [attr.aria-label]="'import.title' | t">
        <h2 class="title">{{ 'import.title' | t }}</h2>
        <p class="lede">{{ lede() }}</p>

        <ul class="entries">
          @for (entry of p.entries; track $index) {
            <li class="entry" [class.entry--fresh]="!entry.existingId">
              <span class="entry__name">{{ entry.name }}</span>

              @if (entry.existingId; as existing) {
                <fieldset class="choice">
                  <legend class="sr-only">{{ 'import.choiceFor' | t: { name: entry.name } }}</legend>
                  <label>
                    <input
                      #firstControl
                      type="radio"
                      [name]="'entry' + $index"
                      [checked]="!replacing().has(existing)"
                      (change)="choose(existing, false)"
                    />
                    <span>{{ 'import.createNew' | t }}</span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      [name]="'entry' + $index"
                      [checked]="replacing().has(existing)"
                      (change)="choose(existing, true)"
                    />
                    <span>{{ 'import.overwrite' | t }}</span>
                  </label>
                </fieldset>
              } @else {
                <span class="entry__fresh">{{ 'import.willBeCreated' | t }}</span>
              }
            </li>
          }
        </ul>

        @if (replacing().size) {
          <p class="warning" role="status">{{ warning() }}</p>
        }

        <div class="actions">
          <ui-button variant="ghost" (click)="cancelled.emit()">{{ 'import.cancel' | t }}</ui-button>
          <ui-button [disabled]="busy()" (click)="confirmed.emit([...replacing()])">
            {{ (busy() ? 'import.importing' : 'import.confirm') | t }}
          </ui-button>
        </div>
      </div>
    }
  `,
  styles: `
    .scrim {
      position: fixed;
      inset: 0;
      /* Same veil the lightbox uses — derived from the theme's own background,
         so it dims rather than tints, in all seven themes. */
      background: color-mix(in srgb, var(--bg) 88%, transparent);
      z-index: 90;
    }

    .panel {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: min(560px, calc(100vw - 32px));
      max-height: calc(100vh - 64px);
      overflow-y: auto;
      z-index: 91;
      background: var(--panel);
      border: var(--bw) solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 20px 22px;
    }

    .title {
      font-size: 16px;
      font-weight: 700;
      margin: 0 0 6px;
    }

    .lede {
      font-size: 12.5px;
      color: var(--text2);
      margin: 0 0 14px;
    }

    .entries {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .entry {
      border: var(--bw) solid var(--border);
      border-radius: var(--radius);
      padding: 10px 12px;
      background: var(--panel2);
    }

    .entry--fresh {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 10px;
    }

    .entry__name {
      font-size: 13px;
      font-weight: 700;
      word-break: break-word;
    }

    .entry__fresh {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text2);
      white-space: nowrap;
    }

    .choice {
      border: 0;
      margin: 6px 0 0;
      padding: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
    }

    .choice label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12.5px;
      cursor: pointer;
    }

    .warning {
      font-size: 12px;
      color: var(--warn);
      margin: 14px 0 0;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 18px;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  `,
})
export class ImportDialog {
  private readonly i18n = inject(I18nService);

  /** Null keeps the dialog closed; a plan opens it. */
  readonly plan = input<ImportPlan | null>(null);
  /** The second upload is in flight. */
  readonly busy = input(false);

  /** Ids of the live collections the user chose to overwrite. */
  readonly confirmed = output<string[]>();
  readonly cancelled = output<void>();

  private readonly firstControl = viewChild<ElementRef<HTMLInputElement>>('firstControl');

  protected readonly replacing = signal(new Set<string>());

  protected readonly lede = computed(() => {
    const clashing = (this.plan()?.entries ?? []).filter(entry => entry.existingId).length;
    return this.i18n.t(clashing === 1 ? 'import.lede.one' : 'import.lede.other', { n: clashing });
  });

  protected readonly warning = computed(() => {
    const n = this.replacing().size;
    return this.i18n.t(
      n === 1 ? 'import.overwriteWarning.one' : 'import.overwriteWarning.other',
      { n },
    );
  });

  constructor() {
    effect(onCleanup => {
      if (!this.plan()) return;

      // A fresh plan starts with nothing selected, so reopening the dialog can
      // never carry a previous run's overwrite decisions into this one.
      this.replacing.set(new Set());

      // Same reason as the lightbox: focus has to move inside for Escape to
      // reach the handler and for a screen reader to announce the dialog.
      queueMicrotask(() => this.firstControl()?.nativeElement.focus());

      const previous = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      onCleanup(() => {
        document.body.style.overflow = previous;
      });
    });
  }

  protected choose(existingId: string, overwrite: boolean): void {
    this.replacing.update(current => {
      const next = new Set(current);
      if (overwrite) {
        next.add(existingId);
      } else {
        next.delete(existingId);
      }
      return next;
    });
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (this.plan() && event.key === 'Escape') {
      event.preventDefault();
      this.cancelled.emit();
    }
  }
}
