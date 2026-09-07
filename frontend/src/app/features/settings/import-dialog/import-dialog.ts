import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { ArchiveApi, ImportPlan } from '../../../core/api/archive-api';
import { I18nService } from '../../../core/i18n';
import { VaultStore } from '../../../core/state/vault.store';
import { saveFile } from '../../../core/utils/download.util';
import { TPipe } from '../../../shared/pipes/t.pipe';
import { UiButton, UiDialog } from '../../../shared/ui';

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
 *
 * **Nothing is preselected, and now that is true.** The docblock claimed it
 * while "Create a new one" was bound to `!replacing().has(existing)`, i.e.
 * checked for everything the moment the dialog opened — so the safe-looking
 * default was itself a decision the user had not made. Every collision starts
 * unanswered and the confirming button stays disabled until all of them have an
 * answer, which is what `group-delete-dialog` already does with its three
 * dispositions.
 *
 * Two other things it owes the user before an irreversible act, both of which
 * the far smaller group-deletion dialog already offered and this one did not:
 * **what is inside the collection being replaced** — the vault's copy may hold
 * 286 items and the archive's 12, and nothing on screen said so — and a
 * **backup first**, since there is no undo.
 *
 * The shell is `ui-dialog`. It used to be a second modal implementation: its
 * own scrim, its own `aria-modal`, its own Escape handler, its own body-scroll
 * lock and a hardcoded layer of 90 and 91 that an open dropdown painted over. All
 * of that is one component's job, and this one had none of what that component
 * has since learned — the focus trap, the return of focus to the opener, the
 * focus-ring room in a scrolling body, the bottom docking below 560px, or the
 * deliberate rule that the *panel* takes focus so a held Enter cannot answer
 * the dialog. This one focused the first radio.
 */
@Component({
  selector: 'app-import-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe, UiButton, UiDialog],
  template: `
    @if (plan(); as p) {
      <ui-dialog
        size="wide"
        role="alertdialog"
        [title]="'import.title' | t"
        [describedBy]="replacing().size ? 'import-warning' : 'import-lede'"
        (dismissed)="cancelled.emit()"
      >
        <p id="import-lede" class="lede">{{ lede() }}</p>

        <ul class="entries">
          @for (entry of p.entries; track $index) {
            <li class="entry" [class.entry--fresh]="!entry.existingId">
              <span class="entry__name">{{ entry.name }}</span>

              @if (entry.existingId; as existing) {
                <!-- What is actually in there. The client already holds every
                     collection, so not counting them was a choice to leave the
                     user guessing about the size of what they are replacing. -->
                <span class="entry__live">{{ liveSize(existing) }}</span>
                <fieldset class="choice">
                  <legend class="sr-only">{{ 'import.choiceFor' | t: { name: entry.name } }}</legend>
                  <label>
                    <input
                      type="radio"
                      [name]="'entry' + $index"
                      [checked]="answers().get(existing) === false"
                      (change)="choose(existing, false)"
                    />
                    <span>{{ 'import.createNew' | t }}</span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      [name]="'entry' + $index"
                      [checked]="answers().get(existing) === true"
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
          <p id="import-warning" class="warning" role="status">{{ warning() }}</p>
        }
        @if (unanswered()) {
          <p class="pending" role="status">{{ unansweredNote() }}</p>
        }

        <!-- The safety net, in the same place and the same words the group
             dialog puts it: there is no undo, so the export is the recovery. -->
        <p class="undo">
          <button type="button" class="undo__link" [disabled]="exporting()" (click)="exportVault()">
            {{ (exporting() ? 'import.exportingVault' : 'import.exportFirst') | t }}
          </button>
        </p>
        @if (exportError()) {
          <p class="warning" role="status">{{ 'import.exportFailed' | t }}</p>
        }

        <ng-container dlgActions>
          <ui-button variant="ghost" (click)="cancelled.emit()">{{ 'import.cancel' | t }}</ui-button>
          <!-- The label states the outcome and the variant states the tone. It
               was the static word "Import" on a primary button, whatever number
               of collections it was about to replace. -->
          <ui-button
            [variant]="replacing().size ? 'danger' : 'primary'"
            [disabled]="unanswered() > 0"
            [pending]="busy()"
            (click)="confirmed.emit([...replacing()])"
          >
            {{ confirmLabel() }}
          </ui-button>
        </ng-container>
      </ui-dialog>
    }
  `,
  styles: `
    .lede {
      margin: 0;
    }

    .entries {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--sp-2);
    }

    .entry {
      border: var(--bw) solid var(--border);
      border-radius: var(--radius);
      padding: var(--sp-2) var(--sp-3);
      background: var(--panel2);
    }

    .entry--fresh {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--sp-2);
    }

    .entry__name {
      font-size: 13px;
      font-weight: 700;
      color: var(--text);
      word-break: break-word;
    }

    .entry__live {
      display: block;
      margin-top: 2px;
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text2);
    }

    .entry__fresh {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text2);
      white-space: nowrap;
    }

    .choice {
      border: 0;
      margin: var(--sp-2) 0 0;
      padding: 0;
      display: flex;
      flex-wrap: wrap;
      gap: var(--sp-2) var(--sp-4);
    }

    .choice label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12.5px;
      cursor: pointer;
    }

    .warning {
      margin: 0;
      font-size: 12px;
      color: var(--warn-strong);
    }

    .pending {
      margin: 0;
      font-size: 12px;
      color: var(--muted-strong);
    }

    .undo {
      margin: 0;
      font-size: var(--fs-sm);
    }

    /*
     * A button, not an anchor: it starts a download rather than navigating, so
     * there is no href for a middle-click to be robbed of. It still has to read
     * as the link in the sentence it sits in.
     */
    .undo__link {
      border: 0;
      padding: 0;
      background: none;
      font: inherit;
      font-weight: 600;
      color: var(--accent-strong);
      text-decoration: underline;
      cursor: pointer;
    }

    .undo__link:disabled {
      color: var(--muted);
      cursor: default;
      text-decoration: none;
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
  /**
   * Read for the size of what is being replaced, and for nothing else. The
   * dialog writes nothing: the settings page performs the import.
   */
  private readonly store = inject(VaultStore);
  private readonly archives = inject(ArchiveApi);

  /** Null keeps the dialog closed; a plan opens it. */
  readonly plan = input<ImportPlan | null>(null);
  /** The second upload is in flight. */
  readonly busy = input(false);

  /** Ids of the live collections the user chose to overwrite. */
  readonly confirmed = output<string[]>();
  readonly cancelled = output<void>();

  /**
   * One answer per collision: absent is "not asked yet", which is a third state
   * and not a synonym for "create a new one".
   */
  protected readonly answers = signal(new Map<string, boolean>());
  protected readonly exporting = signal(false);
  protected readonly exportError = signal(false);

  protected readonly replacing = computed(
    () => new Set([...this.answers()].filter(([, overwrite]) => overwrite).map(([id]) => id)),
  );

  private readonly collisions = computed(
    () => (this.plan()?.entries ?? []).filter(entry => entry.existingId).length,
  );

  protected readonly unanswered = computed(() => this.collisions() - this.answers().size);

  // Both go through `plural` rather than a hand-rolled `=== 1` ternary: one
  // place decides what "singular" means, so a language that ever disagrees is a
  // change to the service and not to every call site.
  protected readonly lede = computed(() =>
    this.i18n.plural(this.collisions(), 'import.lede.one', 'import.lede.other'),
  );

  protected readonly warning = computed(() =>
    this.i18n.plural(
      this.replacing().size,
      'import.overwriteWarning.one',
      'import.overwriteWarning.other',
    ),
  );

  protected readonly unansweredNote = computed(() =>
    this.i18n.plural(this.unanswered(), 'import.unanswered.one', 'import.unanswered.other'),
  );

  /**
   * "Overwrite 4 collections", not "Import".
   *
   * One request can replace every collection in the vault, and the button was
   * the same word whether it replaced none of them or all.
   */
  protected readonly confirmLabel = computed(() =>
    this.replacing().size
      ? this.i18n.plural(
          this.replacing().size,
          'import.confirmOverwrite.one',
          'import.confirmOverwrite.other',
        )
      : this.i18n.t('import.confirm'),
  );

  constructor() {
    effect(() => {
      if (!this.plan()) return;
      // A fresh plan starts with nothing answered, so reopening the dialog can
      // never carry a previous run's overwrite decisions into this one.
      this.answers.set(new Map());
      this.exportError.set(false);
    });
  }

  /** "286 items in your vault right now", or nothing when the id is gone. */
  protected liveSize(existingId: string): string {
    const live = this.store.collection(existingId);
    return live
      ? this.i18n.plural(live.items.length, 'import.entryLive.one', 'import.entryLive.other')
      : this.i18n.t('import.entryArchiveUnknown');
  }

  protected choose(existingId: string, overwrite: boolean): void {
    this.answers.update(current => new Map(current).set(existingId, overwrite));
  }

  /**
   * The whole vault, as a file, before anything is replaced.
   *
   * Self-contained rather than an output the settings page has to wire: the
   * export is the only recovery there is, and a safety net that depends on a
   * caller remembering to connect it is one that ships disconnected.
   */
  protected async exportVault(): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(true);
    this.exportError.set(false);
    try {
      saveFile(await this.archives.downloadVault());
    } catch {
      // Stated in the dialog, not in a toast: the toast would land behind it.
      this.exportError.set(true);
    } finally {
      this.exporting.set(false);
    }
  }
}
