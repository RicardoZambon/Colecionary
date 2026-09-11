import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';

import { ImportPlan } from '../../../core/api/archive-api';
import { I18nService } from '../../../core/i18n';
import { TPipe } from '../../../shared/pipes/t.pipe';
import { UiButton, UiRadio } from '../../../shared/ui';

/** What a single collision can be answered with. Nothing chosen yet is null. */
type Choice = 'new' | 'overwrite';

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
 * never what a distracted Enter keypress does. That is now true of *both*
 * options: "create new" used to be drawn checked, because it was inferred from
 * the absence of an overwrite, and a set with one member per overwrite has no
 * way to tell "they said create a new one" from "they have not answered". The
 * default outcome is unchanged — confirming without answering still creates new
 * collections and destroys nothing — but the screen no longer claims a choice
 * the user did not make.
 */
@Component({
  selector: 'app-import-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe, UiButton, UiRadio],
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
                  <!--
                    ui-radio, not a hand-rolled input plus a hand-styled label.
                    This is the last question asked before one request can
                    overwrite every collection in the vault, which is the worst
                    place in the app to be reimplementing a control - and the
                    kit component is the one that keeps the platform role, the
                    checked state and arrow-key movement within the set.

                    Both options bind the same selection, so exactly one thing
                    decides which is checked. Two independent checked
                    expressions is how a radio pair ends up with the browser and
                    the model disagreeing about which one is on.
                  -->
                  <ui-radio
                    #firstControl
                    [name]="'entry' + $index"
                    optionValue="new"
                    [value]="choiceFor(existing)"
                    (picked)="choose(existing, $event)"
                  >{{ 'import.createNew' | t }}</ui-radio>
                  <ui-radio
                    [name]="'entry' + $index"
                    optionValue="overwrite"
                    [value]="choiceFor(existing)"
                    (picked)="choose(existing, $event)"
                  >{{ 'import.overwrite' | t }}</ui-radio>
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

    /* No top margin and no label rule: ui-radio brings its own padding, which
       is both the spacing above the first option and the hover/press area. The
       gap is the width at which two of those areas meet without overlapping. */
    .choice {
      border: 0;
      margin: 0;
      padding: 0;
      display: flex;
      flex-wrap: wrap;
      gap: var(--sp-4);
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

  /**
   * The host of the first option, so focus can be moved to the platform radio
   * it wraps.
   *
   * Read as an `ElementRef` deliberately: a template ref on an element that
   * carries a component resolves to the *component instance* by default, and
   * `UiRadio` has no focus method to call — so without the `read` this silently
   * hands back an object with no `nativeElement` and the dialog opens with
   * focus still outside it.
   */
  private readonly firstControl = viewChild('firstControl', { read: ElementRef });

  /**
   * One answer per colliding collection, keyed by the live collection's id.
   *
   * Empty means nothing has been answered yet, which is the state the dialog
   * opens in and the reason it is a map of choices rather than a set of
   * overwrites: a set can only say "overwrite" or "not yet said", so "create a
   * new one" had to be inferred from absence — and an inferred answer is
   * indistinguishable from an unanswered question, both to the code and to the
   * radio pair, which is exactly the ambiguity the two hand-rolled inputs
   * encoded twice and disagreed about.
   */
  private readonly choices = signal(new Map<string, Choice>());

  /** Ids the user has answered with "overwrite the one already here". */
  protected readonly replacing = computed(
    () =>
      new Set(
        [...this.choices()].filter(([, choice]) => choice === 'overwrite').map(([id]) => id),
      ),
  );

  // Both go through `plural` rather than a hand-rolled `=== 1` ternary: one
  // place decides what "singular" means, so a language that ever disagrees is a
  // change to the service and not to every call site.
  protected readonly lede = computed(() =>
    this.i18n.plural(
      (this.plan()?.entries ?? []).filter(entry => entry.existingId).length,
      'import.lede.one',
      'import.lede.other',
    ),
  );

  protected readonly warning = computed(() =>
    this.i18n.plural(
      this.replacing().size,
      'import.overwriteWarning.one',
      'import.overwriteWarning.other',
    ),
  );

  constructor() {
    effect(onCleanup => {
      if (!this.plan()) return;

      // A fresh plan starts with nothing selected, so reopening the dialog can
      // never carry a previous run's overwrite decisions into this one.
      this.choices.set(new Map());

      // Same reason as the lightbox: focus has to move inside for Escape to
      // reach the handler and for a screen reader to announce the dialog.
      // The host is a custom element and so not focusable; the platform radio
      // it wraps is the real control, and Tab entering a set with nothing
      // chosen lands on its first option, which is where this puts it.
      queueMicrotask(() => {
        const host = this.firstControl()?.nativeElement as HTMLElement | undefined;
        host?.querySelector('input')?.focus();
      });

      const previous = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      onCleanup(() => {
        document.body.style.overflow = previous;
      });
    });
  }

  /** What this collision is currently answered with; null while unanswered. */
  protected choiceFor(existingId: string): Choice | null {
    return this.choices().get(existingId) ?? null;
  }

  protected choose(existingId: string, choice: string): void {
    this.choices.update(current => new Map(current).set(existingId, choice as Choice));
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (this.plan() && event.key === 'Escape') {
      event.preventDefault();
      this.cancelled.emit();
    }
  }
}
