import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';

import { I18nService } from '../../../core/i18n';
import { editableTags, withTagAdded, withTagRemoved } from '../../../core/utils/tags.util';
import { TPipe } from '../../pipes/t.pipe';
import { UiIcon } from '../icon/icon';

/**
 * Edits an item's tags: the ones it has, as removable chips, plus a field for
 * adding another.
 *
 * The rules — trim, no duplicate ignoring case, never the derived `wanted` tag —
 * live in `core/utils/tags.util.ts`, not here, because the bulk bar applies the
 * identical rules to forty items at once and two implementations would
 * eventually disagree about what a tag is.
 *
 * `suggestions` is what the rest of the collection already uses. A tag
 * vocabulary that grows one typo at a time is one nobody can filter by, so the
 * cheapest fix is to show people the words they have already chosen.
 */
@Component({
  selector: 'ui-tag-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe, UiIcon],
  template: `
    <div class="tags">
      @for (tag of shown(); track tag) {
        <span class="tag">
          {{ tag }}
          @if (!disabled()) {
            <button
              type="button"
              class="tag__remove"
              [attr.aria-label]="removeLabel(tag)"
              [title]="removeLabel(tag)"
              (click)="remove(tag)"
            ><ui-icon name="close" [size]="10" /></button>
          }
        </span>
      } @empty {
        <span class="none">{{ 'tags.none' | t }}</span>
      }
    </div>

    @if (!disabled()) {
      <div class="add">
        <input
          #field
          class="add__field"
          type="text"
          autocomplete="off"
          [attr.list]="listId"
          [placeholder]="'tags.placeholder' | t"
          [attr.aria-label]="'tags.addAria' | t"
          [value]="draft()"
          (input)="draft.set($any($event.target).value)"
          (keydown.enter)="$event.preventDefault(); commit()"
          (blur)="commit()"
        />
        <!--
          A native datalist rather than a custom menu: it filters as you type,
          it is reachable by keyboard without any code, and it does not trap
          focus in a form whose Enter key already means something.
        -->
        <datalist [id]="listId">
          @for (option of unusedSuggestions(); track option) {
            <option [value]="option"></option>
          }
        </datalist>
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--sp-2);
      min-width: 0;
    }

    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: var(--sp-2);
      align-items: center;
    }

    .none {
      font-size: var(--fs-sm);
      color: var(--muted-strong);
    }

    .tag {
      display: inline-flex;
      align-items: center;
      gap: var(--sp-1);
      padding: 3px var(--sp-2);
      border: var(--bw) solid var(--border);
      border-radius: var(--pill);
      background: var(--panel2);
      font-size: var(--fs-sm);
      color: var(--text);
      /* A tag is user data and may be anything; it must not stretch the form. */
      max-width: 100%;
      overflow-wrap: anywhere;
    }

    .tag__remove {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 0;
      padding: 0;
      background: none;
      color: var(--muted-strong);
      cursor: pointer;

      &:hover {
        color: var(--danger);
      }

      &:focus-visible {
        outline: var(--focus-width) solid var(--accent);
        outline-offset: var(--focus-offset);
      }
    }

    .add__field {
      width: 100%;
      padding: 7px var(--sp-3);
      border: var(--bw) solid var(--border);
      border-radius: var(--radius);
      background: var(--panel);
      color: var(--text);
      font-family: var(--font-body);
      font-size: var(--fs-md);

      &::placeholder {
        color: var(--muted-strong);
      }

      &:focus-visible {
        outline: var(--focus-width) solid var(--accent);
        outline-offset: var(--focus-offset);
      }
    }

    @media (max-width: 900px) {
      .add__field {
        min-height: var(--tap);
      }

      .tag__remove {
        /* Grow the target, keep the pill: a chip row is dense by design. */
        position: relative;

        &::after {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: var(--tap);
          height: var(--tap);
          transform: translate(-50%, -50%);
        }
      }
    }
  `,
})
export class UiTagInput {
  private readonly i18n = inject(I18nService);

  /** The item's whole tag list, derived tag included — it is filtered here. */
  readonly tags = model<readonly string[]>([]);
  /** Tags already used elsewhere in this collection, offered as completions. */
  readonly suggestions = input<readonly string[]>([]);
  readonly disabled = input(false);

  protected readonly draft = signal('');
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');
  /** Unique per instance, so two editors on one page cannot share a datalist. */
  protected readonly listId = `tags-${Math.random().toString(36).slice(2, 9)}`;

  protected readonly shown = computed(() => editableTags(this.tags()));

  /** Offering a tag the item already carries would be a dead menu entry. */
  protected readonly unusedSuggestions = computed(() => {
    const have = new Set(this.shown().map(t => t.toLowerCase()));
    return this.suggestions().filter(s => !have.has(s.toLowerCase()));
  });

  protected removeLabel(tag: string): string {
    return this.i18n.t('tags.remove', { tag });
  }

  /**
   * Commits the field, on Enter and on blur.
   *
   * Blur as well as Enter because a typed-but-uncommitted tag that vanishes
   * when you click Save is indistinguishable from a save that dropped it. The
   * util refuses blanks, duplicates and the reserved tag, so committing an
   * empty or repeated field is simply a no-op rather than a special case here.
   */
  protected commit(): void {
    const next = withTagAdded(this.tags(), this.draft());
    if (next !== this.tags()) this.tags.set(next);
    this.draft.set('');
    // The element too, not only the signal. A `[value]` binding writes the DOM
    // when the *bound value* changes, so a draft that returns to the string
    // Angular last wrote — typing a tag and committing it within one change
    // detection pass, or re-adding one that is already there — leaves the text
    // the user typed sitting in the field, ready to be committed a second time.
    const field = this.field()?.nativeElement;
    if (field) field.value = '';
  }

  protected remove(tag: string): void {
    const next = withTagRemoved(this.tags(), tag);
    if (next !== this.tags()) this.tags.set(next);
  }
}
