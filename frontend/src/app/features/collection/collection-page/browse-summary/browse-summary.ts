import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
} from '@angular/core';

import { TPipe } from '../../../../shared/pipes/t.pipe';
import { UiButton, UiCheckbox, UiChip, UiIcon } from '../../../../shared/ui';

/** Which narrowing a chip stands for, and what removing it clears. */
export type BrowseFilterKind = 'condition' | 'own' | 'section' | 'tag' | 'search';

/** One active narrowing, already worded by the page. */
export interface BrowseFilterChip {
  kind: BrowseFilterKind;
  /** "Condition: Mint" — the whole phrase, so this stays presentational. */
  label: string;
}

/**
 * What the list is showing, and how to stop showing only that.
 *
 * The main screen of the app used to answer none of it. A 286-item collection
 * showing 9 cards said "9 / 34 · 26%" in the hero — the **unfiltered** group
 * total, contradicting the screen — and to find out why, the user had to notice
 * a selected condition chip, notice a selected status chip, notice the tag chip,
 * notice that one section heading had gone a slightly different colour, and
 * remember that the search box in the top bar still had text in it. "Clear
 * filters" existed at exactly one place: inside the zero-result empty state,
 * i.e. only once the filters had hidden *everything*.
 *
 * So: the count of what is on screen against the scope's own total, one
 * removable chip per narrowing in force — the `?s=` section filter included,
 * which had no representation anywhere but the heading's colour — and one way
 * out, wherever the filters are in force rather than only where they emptied the
 * list. The grid gets the row count the table already had in its footer.
 *
 * **It is the page's live region.** Neither view is inside one and `ui-empty` is
 * deliberately not `role="status"` (its own docs argue that correctly: it
 * renders on first paint, where a live region announces nothing and steals the
 * announcement from whatever did change), which left the page owing an
 * announcement that nothing supplied — a chip toggle rebuilt or emptied the list
 * in total silence. This region is present from first paint and holds one short
 * sentence, so every filter change, sort pick, column-header click and section
 * toggle produces one announcement without turning the list itself into a live
 * region.
 *
 * The select-all box lives here too, and not in the table's header where it was:
 * the grid is the default view for any group without children and the view a
 * search forces, and there it was unreachable — forty cards meant forty clicks.
 * Here both views get it from one place, beside the count it acts on.
 */
@Component({
  selector: 'app-browse-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe, UiButton, UiCheckbox, UiChip, UiIcon],
  template: `
    <!--
      tabindex="-1" is load-bearing: removing a chip navigates, so the button
      that was pressed is gone by the next render and focus would fall to
      <body>, restarting the next Tab at the skip link. The handler parks focus
      on this region first, which also makes a reader hear the new count.
    -->
    <div class="summary" tabindex="-1" [attr.aria-label]="'browse.summaryAria' | t">
      @if (canEdit() && selectable()) {
        <span class="summary__pick" [attr.title]="'select.rangeHint' | t">
          <ui-checkbox
            [checked]="allSelected()"
            [indeterminate]="someSelected()"
            [ariaLabel]="'select.all' | t"
            (picked)="allPicked.emit($event.checked)"
          />
        </span>
      }

      <span class="summary__state" aria-live="polite">
        <span class="summary__count">{{ countLabel() }}</span>

        @if (filters().length) {
          <span class="summary__label">{{ 'browse.filteredBy' | t }}</span>
          @for (filter of filters(); track filter.kind) {
            <ui-chip
              [small]="true"
              [selected]="true"
              [ariaLabel]="'browse.filter.remove' | t: { label: filter.label }"
              [hint]="'browse.filter.remove' | t: { label: filter.label }"
              (click)="remove(filter.kind)"
            >{{ filter.label }}<span class="drop"><ui-icon name="close" [size]="10" [strokeWidth]="2.4" /></span></ui-chip>
          }
        }
      </span>

      @if (filtering()) {
        <ui-button variant="link" size="sm" (click)="clear()">
          {{ 'collection.clearFilters' | t }}
        </ui-button>
      }
    </div>
  `,
  styles: `
    .summary {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      flex-wrap: wrap;
      min-width: 0;

      /* Focused only programmatically, after a chip removes itself. The ring
         still belongs there: it is the one signal that focus landed here rather
         than nowhere. */
      &:focus-visible {
        outline: var(--focus-width) solid var(--accent);
        outline-offset: var(--focus-offset);
        border-radius: var(--radius);
      }
    }

    .summary__pick {
      display: flex;
      align-items: center;
      flex: none;
    }

    .summary__state {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      flex-wrap: wrap;
      min-width: 0;
    }

    .summary__count {
      font-family: var(--font-mono);
      font-size: var(--fs-xs);
      font-weight: 700;
      /* Information, so the secondary type layer — --muted is decoration and
         deliberately below AA. */
      color: var(--muted-strong);
      white-space: nowrap;
    }

    .summary__label {
      font-family: var(--font-mono);
      font-size: 10px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--muted-strong);
      white-space: nowrap;
    }

    /* Decoration only — the accessible name says what the click does, and the
       chip's own text is the filter. The mark is the app's close icon rather
       than a text multiplication sign: a raw glyph resolves from whatever font
       happens to cover it, so it never matched the stroke weight or the optical
       alignment of the identical control in the toast, the dialog and the
       upload rows. The three glyphs the app keeps on purpose are the ones that
       are vocabulary rather than chrome — the copy count's multiplier, "nothing
       here", and the approximation mark on a value standing in for an estimate. */
    .drop {
      margin-left: 5px;
      opacity: 0.7;
      display: inline-flex;
      align-items: center;
      vertical-align: middle;
    }
  `,
})
export class BrowseSummary {
  private readonly host = inject(ElementRef<HTMLElement>);

  /** "9 of 34 items", already pluralised by the page. */
  readonly countLabel = input.required<string>();
  readonly filters = input.required<BrowseFilterChip[]>();
  /**
   * Whether anything is narrowing the list. Not the same as
   * `filters().length > 0` today, and it must stay a separate answer: the page
   * owns what counts as filtering.
   */
  readonly filtering = input(false);

  /**
   * Whether to offer the selection box at all — an **input**, never a read of
   * `VaultStore.canEdit`, so this leaf keeps `VaultApi` out of the TestBed of
   * everything that renders it.
   */
  readonly canEdit = input(true);
  /**
   * Whether there is anything on screen to select.
   *
   * Separate from `canEdit` because they answer different questions: one is the
   * session's role, the other is the state of the list. Narrow a group to
   * nothing and the summary used to read "0 of 9 items" beside a live select-all
   * that could not do anything — `allSelected` guards the empty list so the box
   * never came back *checked*, and `setAll` over nothing is a no-op, so the
   * control was simply dead. The region itself stays rendered either way: a
   * live region only announces changes inside one already being observed, so
   * removing it would silence the count it exists to speak.
   */
  readonly selectable = input(true);
  readonly allSelected = input(false);
  readonly someSelected = input(false);

  readonly removed = output<BrowseFilterKind>();
  readonly cleared = output<void>();
  readonly allPicked = output<boolean>();

  protected remove(kind: BrowseFilterKind): void {
    this.park();
    this.removed.emit(kind);
  }

  protected clear(): void {
    this.park();
    this.cleared.emit();
  }

  /** Keeps the keyboard where the user was; see the note in the template. */
  private park(): void {
    (this.host.nativeElement as HTMLElement)
      .querySelector<HTMLElement>('.summary')
      ?.focus({ preventScroll: true });
  }
}
