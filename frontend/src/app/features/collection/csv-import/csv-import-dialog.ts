import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { I18nService, MessageKey } from '../../../core/i18n';
import { Collection, GroupField } from '../../../core/models';
import { toCsv } from '../../../core/utils/csv.util';
import { saveFile } from '../../../core/utils/download.util';
import { TPipe } from '../../../shared/pipes/t.pipe';
import { UiButton, UiDialog, UiField, UiTextarea } from '../../../shared/ui';
import {
  CsvImportIssue,
  CsvImportPlan,
  DuplicateMode,
  PlannedRow,
  RowOutcome,
  planCsvImport,
  templateCsv,
} from './csv-import';

/**
 * How many rows the preview draws before it stops.
 *
 * The summary above it already carries the totals, so the table's job is to let
 * someone recognise their own data and spot the column that landed in the wrong
 * place — which the first twenty rows do as well as two thousand would, and
 * without putting two thousand DOM rows inside a dialog on a phone.
 */
const PREVIEW_ROWS = 20;

/** How many issues are listed before the rest are counted rather than named. */
const PREVIEW_ISSUES = 12;

/**
 * The recognised columns, in the order the table draws them — the sentence that
 * tells the user what to write, assembled from the headings themselves so that
 * renaming a column on screen renames it here too.
 */
const COLUMN_KEYS: readonly MessageKey[] = [
  'itemList.name',
  'itemList.group',
  'itemList.year',
  'itemList.copies',
  'itemList.condition',
  'itemList.value',
];

const OUTCOME_KEYS: Record<RowOutcome, MessageKey> = {
  create: 'csvImport.outcome.create',
  update: 'csvImport.outcome.update',
  skip: 'csvImport.outcome.skip',
};

/**
 * Paste a spreadsheet, see exactly what it would do, then do it.
 *
 * The dialog owns the *reading* — the text, the duplicate rule, the plan
 * recomputed from both — and owns none of the *writing*. It emits the plan and
 * the page performs one full-document PUT (rule 14), the same division the bulk
 * bar follows: a component that both previewed and wrote would be free to write
 * something other than what it drew.
 *
 * The preview is not a courtesy. This is the only gesture in the app that adds
 * hundreds of rows at once from a file the user has not read line by line, and
 * the plan on screen is literally the object that gets applied — so the counts,
 * the destinations and the "what happens" column cannot be a description of a
 * different piece of code.
 *
 * ## Scope
 *
 * One dialog serves both asks. Opened at the collection root, a `Grupo` cell is
 * mandatory reading and a blank one leaves the item unfiled. Opened inside a
 * group, the same cell names a sub-group *of that group* and a blank one means
 * the group itself — so importing straight into what is open needs a file of
 * nothing but names.
 */
@Component({
  selector: 'app-csv-import-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe, UiButton, UiDialog, UiField, UiTextarea],
  templateUrl: './csv-import-dialog.html',
  styleUrl: './csv-import-dialog.scss',
})
export class CsvImportDialog {
  private readonly i18n = inject(I18nService);

  /** The collection the rows are read against — never written to here. */
  readonly collection = input.required<Collection>();
  /** The open group, or `''` at the collection root. */
  readonly scopeId = input('');
  /** Its name, for the lede. Empty at the root. */
  readonly scopeName = input('');
  /** The open group's fields, so the template offers the columns it declares. */
  readonly fields = input<readonly GroupField[]>([]);
  /** True while the page's PUT is in flight. */
  readonly saving = input(false);

  readonly confirmed = output<CsvImportPlan>();
  readonly cancelled = output<void>();

  protected readonly text = signal('');
  protected readonly duplicates = signal<DuplicateMode>('skip');
  /** Set when a picked file could not be read; cleared by the next attempt. */
  protected readonly fileError = signal(false);
  protected readonly fileName = signal('');

  /**
   * Recomputed from the text and the duplicate rule, and from nothing else.
   *
   * A `computed` rather than a debounce: this only re-runs when something reads
   * it, the realistic input is one paste rather than two thousand keystrokes,
   * and a debounce would put the summary a beat behind the box — which on a
   * screen whose whole purpose is "this is what will happen" is the one lag
   * that matters.
   */
  protected readonly plan = computed(() =>
    planCsvImport(
      this.text(),
      this.collection(),
      { scopeId: this.scopeId(), duplicates: this.duplicates() },
      this.collection().name,
    ),
  );

  protected readonly writes = computed(
    () => this.plan().created + this.plan().updated,
  );

  /** Rows the table draws, and how many it does not. */
  protected readonly previewRows = computed(() => this.plan().rows.slice(0, PREVIEW_ROWS));
  protected readonly hiddenRows = computed(() =>
    Math.max(0, this.plan().rows.length - PREVIEW_ROWS),
  );
  protected readonly previewIssues = computed(() => this.plan().issues.slice(0, PREVIEW_ISSUES));
  protected readonly hiddenIssues = computed(() =>
    Math.max(0, this.plan().issues.length - PREVIEW_ISSUES),
  );

  protected readonly hasInput = computed(() => this.text().trim().length > 0);

  /**
   * True for a file that parsed but would change nothing — every row already in
   * the collection. Distinct from "nothing pasted yet", and worth its own
   * sentence: the user did everything right and the answer is still "no".
   */
  protected readonly inert = computed(
    () => this.hasInput() && this.writes() === 0 && this.plan().issues.length === 0,
  );

  protected readonly lede = computed(() =>
    this.scopeId() && this.scopeName()
      ? this.i18n.t('csvImport.intoGroup', { name: this.scopeName() })
      : this.i18n.t('csvImport.intoCollection'),
  );

  /** The recognised columns, named the way the table names them. */
  protected readonly format = computed(() =>
    this.i18n.t('csvImport.format', {
      columns: COLUMN_KEYS.map(key => this.i18n.t(key)).join(' · '),
      name: this.i18n.t('itemList.name'),
    }),
  );

  protected readonly summary = computed(() => {
    const plan = this.plan();
    const parts: string[] = [];
    if (plan.created) {
      parts.push(this.i18n.plural(plan.created, 'csvImport.willCreate.one', 'csvImport.willCreate.other'));
    }
    if (plan.updated) {
      parts.push(this.i18n.plural(plan.updated, 'csvImport.willUpdate.one', 'csvImport.willUpdate.other'));
    }
    if (plan.skipped) {
      parts.push(this.i18n.plural(plan.skipped, 'csvImport.willSkip.one', 'csvImport.willSkip.other'));
    }
    if (plan.newGroups.length) {
      parts.push(
        this.i18n.plural(plan.newGroups.length, 'csvImport.newGroups.one', 'csvImport.newGroups.other'),
      );
    }
    if (plan.newFields.length) {
      parts.push(
        this.i18n.plural(plan.newFields.length, 'csvImport.newFields.one', 'csvImport.newFields.other'),
      );
    }
    return parts;
  });

  protected readonly issuesHeading = computed(() =>
    this.i18n.plural(this.plan().issues.length, 'csvImport.issues.one', 'csvImport.issues.other'),
  );

  protected readonly confirmLabel = computed(() =>
    this.saving()
      ? this.i18n.t('csvImport.importing')
      : this.i18n.plural(this.writes(), 'csvImport.confirm.one', 'csvImport.confirm.other'),
  );

  protected outcomeLabel(row: PlannedRow): string {
    return this.i18n.t(OUTCOME_KEYS[row.outcome]);
  }

  /** An issue's own sentence, with its line — or "File" for a whole-file one. */
  protected issueWhere(issue: CsvImportIssue): string {
    return issue.line
      ? this.i18n.t('csvImport.issueLine', { line: issue.line })
      : this.i18n.t('csvImport.issueFile');
  }

  protected issueText(issue: CsvImportIssue): string {
    return this.i18n.t(issue.key, issue.params);
  }

  protected async readFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Cleared before anything can go wrong: without this, picking the very same
    // file after a failed attempt fires no `change` event and the button looks
    // dead. The same reason the archive import clears its own.
    input.value = '';
    if (!file) return;

    this.fileError.set(false);
    try {
      this.text.set(await file.text());
      this.fileName.set(file.name);
    } catch {
      this.fileError.set(true);
      this.fileName.set('');
    }
  }

  /**
   * The header, as a file. Built from the same catalogue the table's headings
   * come from, plus whatever fields the open group declares — so the columns
   * offered are the columns this collection actually has.
   */
  protected downloadTemplate(): void {
    const rows = templateCsv(key => this.i18n.t(key), this.fields());
    saveFile({
      // The BOM is not decoration: without it Excel opens a UTF-8 CSV as
      // Latin-1 and the accented headings arrive as mojibake, which is exactly
      // the header the parser then fails to recognise on the way back.
      blob: new Blob([`﻿${toCsv(rows)}`], { type: 'text/csv;charset=utf-8' }),
      filename: this.i18n.t('csvImport.templateName'),
    });
  }

  protected submit(): void {
    if (!this.writes() || this.saving()) return;
    this.confirmed.emit(this.plan());
  }
}
