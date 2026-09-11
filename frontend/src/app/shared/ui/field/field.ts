import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  inject,
  input,
} from '@angular/core';

/** Unique enough, and stable per instance — ids only have to be unique per document. */
let nextFieldId = 0;

/**
 * Label + control layout used by every form field.
 *
 * ## It looked like a label and named nothing
 *
 * This rendered `<label class="label">` as a **sibling** of the projected
 * control, with no `for` — so it was a styled caption, not a label. An audit of
 * the add-item form found eight visible controls with no accessible name at
 * all, and every one of them was already inside a `ui-field`. The same held on
 * collection settings and the setup wizard: 37 call sites, none of them
 * labelled. A screen reader announced "edit text, blank".
 *
 * The fix has to be explicit `for`/`id` rather than the tidier trick of
 * wrapping the content in the `<label>`. Implicit association binds the label
 * to the first *labelable* descendant, and `<button>` is labelable:
 * `ui-tag-input` renders each tag's remove button **before** its text field, so
 * a wrapping label would have named — and on click, activated — a delete
 * button. Worse than no label.
 *
 * So the search is deliberately narrowed to `input, select, textarea`, which
 * has two useful consequences. It finds the right control inside
 * `ui-tag-input`, and it finds *nothing* inside a `ui-field` whose content is a
 * `ui-toggle` (a `role="switch"` button) — which is correct, because a switch
 * carries its own `ariaLabel` and a false association is worse than none.
 */
@Component({
  selector: 'ui-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="label">{{ label() }}</label>
    <ng-content />
    @if (hint()) {
      <span class="hint">{{ hint() }}</span>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .label {
      font-family: var(--font-mono);
      font-size: var(--fs-xs);
      letter-spacing: 0.1em;
      color: var(--muted-strong);
      text-transform: uppercase;
    }

    .hint {
      font-size: 11.5px;
      color: var(--text2);
    }
  `,
})
export class UiField {
  readonly label = input.required<string>();

  /**
   * Optional note under the control, for what the field does rather than what
   * it is called — "leave empty to follow the account", say. Empty renders
   * nothing, so existing fields are untouched.
   *
   * Visually associated only. Wiring it as `aria-describedby` would need the
   * control to accept an id, and a hint folded into the accessible *name*
   * would make every field announce a sentence.
   */
  readonly hint = input('');

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly fallbackId = `ui-field-${(nextFieldId += 1)}`;

  constructor() {
    // The write phase, because this only touches the DOM. Deliberately not a
    // signal the template reads: that would schedule another render from inside
    // one. It re-runs on every render because the projected control can come
    // and go — the Section field appears only when the group declares any —
    // and re-running is one querySelector.
    afterRenderEffect({
      write: () => {
        const root = this.host.nativeElement;
        const label = root.querySelector('label.label');
        // Buttons are excluded on purpose; see the note on the class.
        const control = root.querySelector('input, select, textarea');
        if (!label || !control) return;
        if (!control.id) control.id = this.fallbackId;
        if (label.getAttribute('for') !== control.id) {
          label.setAttribute('for', control.id);
        }
      },
    });
  }
}
