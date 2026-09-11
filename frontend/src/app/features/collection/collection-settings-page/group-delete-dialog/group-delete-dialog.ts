import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';

import { I18nService } from '../../../../core/i18n';
import { Collection } from '../../../../core/models';
import {
  GroupDeletePlan,
  GroupDisposition,
  groupDeletePlan,
} from '../../../../core/utils/group-delete.util';
import { groupById } from '../../../../core/utils/groups.util';
import { TPipe } from '../../../../shared/pipes/t.pipe';
import { UiButton, UiDialog, UiRadio } from '../../../../shared/ui';

/** How many sub-groups are named before the line turns into "and N more". */
const NAMED_SUB_GROUPS = 4;

/**
 * Asks what happens to a group's contents before the group goes.
 *
 * It replaces a refusal. Deleting a branch used to be blocked outright the
 * moment any item existed anywhere under it — safe, and a dead end, because
 * nothing in the app moved items in bulk, so "move them first" was an
 * instruction with no way to follow it. The same code deleted an *empty*
 * sub-tree silently, unconfirmed, with no count shown, which was the genuinely
 * dangerous half.
 *
 * Nothing is preselected, for the reason the import dialog established: an
 * irreversible choice is never what a distracted Enter should answer. The
 * arithmetic is not here — {@link groupDeletePlan} computes both the counts on
 * screen and the graph the page saves, so the number read and the change made
 * cannot disagree.
 */
@Component({
  selector: 'app-group-delete-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe, UiButton, UiDialog, UiRadio],
  template: `
    @if (group(); as node) {
      <ui-dialog
        [title]="'collSettings.groups.delete.title' | t: { name: node.name }"
        [describedBy]="undoId"
        (dismissed)="dismissed.emit()"
      >
        <p class="lede">{{ 'collSettings.groups.delete.lede' | t }}</p>

        <ul class="survey">
          @if (subGroupLine(); as line) {
            <li>{{ line }}</li>
          }
          <li>{{ itemLine() }}</li>
          @if (sectionLine(); as line) {
            <li>{{ line }}</li>
          }
        </ul>

        <fieldset class="choices">
          <legend class="sr-only">
            {{ 'collSettings.groups.delete.choiceAria' | t: { name: node.name } }}
          </legend>

          <!-- ui-radio, not a hand-rolled input and label. This is the choice
               that decides whether a group's items are re-parented, unfiled or
               destroyed, which is the worst place in the app to be
               reimplementing a control. Nothing is preselected — the component
               never selects anything by itself, which is exactly the behaviour
               this dialog already depended on. -->
          @for (choice of choices(); track choice.value) {
            <div class="choice" [class.choice--picked]="chosen() === choice.value">
              <ui-radio
                name="disposition"
                [optionValue]="choice.value"
                [value]="chosen()"
                [hint]="choice.sub"
                (picked)="chosen.set(choice.value)"
              >{{ choice.label }}</ui-radio>
            </div>
          }
        </fieldset>

        <p class="undo" [id]="undoId">
          {{ 'collSettings.groups.delete.noUndo' | t }}
          <button type="button" class="undo__link" [disabled]="exporting()" (click)="exportRequested.emit()">
            {{
              (exporting()
                ? 'collSettings.groups.delete.exporting'
                : 'collSettings.groups.delete.exportFirst'
              ) | t
            }}
          </button>
        </p>

        <ng-container dlgActions>
          <ui-button variant="ghost" (click)="dismissed.emit()">
            {{ 'collSettings.groups.delete.cancel' | t }}
          </ui-button>
          <ui-button variant="danger" [disabled]="!chosen()" (click)="confirm()">
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

    .survey {
      margin: 0;
      padding-left: var(--sp-5);
      display: flex;
      flex-direction: column;
      gap: var(--sp-1);
      font-size: var(--fs-sm);
      color: var(--muted-strong);
    }

    .choices {
      border: 0;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--sp-2);
    }

    /*
     * The card around one option. ui-radio pulls its own row out by --sp-2 on
     * each side and pads it back, so its label fills this box exactly: the
     * whole card stays clickable without the wrapper claiming to be a label it
     * is not. Hence no vertical padding here — the radio's own is the card's,
     * and adding a second layer would inset the text further down than in.
     */
    .choice {
      padding: 0 var(--sp-2);
      border: var(--bw) solid var(--border);
      border-radius: var(--radius);
      background: var(--panel2);
      transition: border-color var(--dur-fast) var(--ease-out);
    }

    .choice--picked {
      border-color: var(--accent);
    }

    .undo {
      margin: 0;
      font-size: var(--fs-sm);
      color: var(--danger);
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
      color: var(--accent);
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
export class GroupDeleteDialog {
  private readonly i18n = inject(I18nService);

  readonly collection = input.required<Collection>();
  readonly groupId = input.required<string>();
  /** The per-collection export is the only safety net there is, so it says so. */
  readonly exporting = input(false);

  readonly confirmed = output<GroupDisposition>();
  readonly dismissed = output<void>();
  readonly exportRequested = output<void>();

  /** Unique per instance, so two dialogs cannot share an aria target. */
  protected readonly undoId = `gdel-${Math.random().toString(36).slice(2, 9)}`;

  /** Nothing preselected: an irreversible default is not what Enter should do. */
  protected readonly chosen = signal<GroupDisposition | null>(null);

  protected readonly group = computed(() =>
    groupById(this.collection().groups, this.groupId()) ?? null,
  );

  /**
   * All three plans, not just the chosen one: every line the dialog puts on
   * screen has to come from the same function that will apply it.
   */
  private readonly plans = computed<Record<GroupDisposition, GroupDeletePlan>>(() => {
    const collection = this.collection();
    const id = this.groupId();
    return {
      reparent: groupDeletePlan(collection, id, 'reparent'),
      unfile: groupDeletePlan(collection, id, 'unfile'),
      delete: groupDeletePlan(collection, id, 'delete'),
    };
  });

  private readonly parentName = computed(() => {
    const node = this.group();
    if (!node?.parentId) return null;
    return groupById(this.collection().groups, node.parentId)?.name ?? null;
  });

  protected readonly subGroupLine = computed(() => {
    const names = this.plans().delete.subGroupNames;
    if (!names.length) return '';
    const shown =
      names.length > NAMED_SUB_GROUPS
        ? this.i18n.t('collSettings.groups.delete.subGroupsMore', {
            names: names.slice(0, NAMED_SUB_GROUPS).join(', '),
            n: names.length - NAMED_SUB_GROUPS,
          })
        : names.join(', ');
    return this.i18n.t(
      names.length === 1
        ? 'collSettings.groups.delete.subGroups.one'
        : 'collSettings.groups.delete.subGroups.other',
      { n: names.length, names: shown },
    );
  });

  protected readonly itemLine = computed(() => {
    const n = this.plans().delete.itemCount;
    if (!n) return this.i18n.t('collSettings.groups.delete.noItems');
    return this.i18n.plural(
      n,
      'collSettings.groups.delete.items.one',
      'collSettings.groups.delete.items.other',
    );
  });

  protected readonly sectionLine = computed(() => {
    // The whole branch's sections, which is what disposition 2 and 3 remove;
    // keeping the contents keeps the surviving sub-groups' own.
    const n = this.plans().delete.sectionCount;
    if (!n) return '';
    return this.i18n.plural(
      n,
      'collSettings.groups.delete.sections.one',
      'collSettings.groups.delete.sections.other',
    );
  });

  protected readonly choices = computed(() => {
    const parent = this.parentName();
    const items = this.plans().delete.itemCount;
    return [
      {
        value: 'reparent' as const,
        label: this.i18n.t('collSettings.groups.delete.reparent'),
        sub: parent
          ? this.i18n.t('collSettings.groups.delete.reparentSub', { parent })
          : this.i18n.t('collSettings.groups.delete.reparentSubRoot'),
      },
      {
        value: 'unfile' as const,
        label: this.i18n.t('collSettings.groups.delete.unfile'),
        sub: this.i18n.t('collSettings.groups.delete.unfileSub'),
      },
      {
        value: 'delete' as const,
        label: this.i18n.t('collSettings.groups.delete.deleteItems'),
        sub: this.i18n.plural(
          items,
          'collSettings.groups.delete.deleteItemsSub.one',
          'collSettings.groups.delete.deleteItemsSub.other',
        ),
      },
    ];
  });

  /**
   * The button states what it does. "Delete" on a dialog with three outcomes
   * says nothing about which one is about to happen, and the destructive one has
   * to carry its own count.
   */
  protected readonly confirmLabel = computed(() => {
    const items = this.plans().delete.itemCount;
    switch (this.chosen()) {
      case 'reparent':
        return this.i18n.t('collSettings.groups.delete.confirmReparent');
      case 'unfile':
        return items
          ? this.i18n.plural(
              items,
              'collSettings.groups.delete.confirmUnfile.one',
              'collSettings.groups.delete.confirmUnfile.other',
            )
          : this.i18n.t('collSettings.groups.delete.confirm');
      case 'delete':
        return items
          ? this.i18n.plural(
              items,
              'collSettings.groups.delete.confirmDelete.one',
              'collSettings.groups.delete.confirmDelete.other',
            )
          : this.i18n.t('collSettings.groups.delete.confirm');
      default:
        return this.i18n.t('collSettings.groups.delete.confirm');
    }
  });

  protected confirm(): void {
    const chosen = this.chosen();
    if (chosen) this.confirmed.emit(chosen);
  }
}
