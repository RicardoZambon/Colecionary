import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';

/**
 * One option in a mutually exclusive set, with its label and optional hint.
 *
 * ## Why this is in the kit
 *
 * Five places hand-rolled a raw `<input type="radio">` with their own label
 * styling: the CSV duplicate rule, the archive-import collision choice (twice)
 * and the group-delete disposition. Every one of them is the last question
 * asked before something irreversible happens, which is the worst place in the
 * app to be reimplementing a control — the group-delete radios in particular
 * decide whether a group's items are re-parented, unfiled or destroyed.
 *
 * It wraps a real platform radio rather than painting a div, for the same
 * reason `ui-checkbox` does: only the platform gives the role, the checked
 * state, arrow-key movement within the group and the "3 of 3" announcement.
 * A `role="radio"` reimplementation has to rebuild all four and typically
 * rebuilds three.
 *
 * ## Nothing is preselected, on purpose
 *
 * `value` is a `model` and the caller is free to leave it unset. Dispositions
 * for a destructive act ship with no default (standards rule 9) — a
 * preselected option is one an impatient user confirms without reading, and the
 * whole point of asking is that the three outcomes are not interchangeable.
 * So this component never selects anything by itself.
 */
@Component({
  selector: 'ui-radio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="radio" [class.radio--disabled]="disabled()">
      <input
        type="radio"
        class="radio__input"
        [name]="name()"
        [value]="optionValue()"
        [checked]="checked()"
        [disabled]="disabled()"
        (change)="pick()"
      />
      <span class="radio__text">
        <span class="radio__label"><ng-content /></span>
        @if (hint(); as h) {
          <span class="radio__hint">{{ h }}</span>
        }
      </span>
    </label>
  `,
  styles: `
    :host {
      display: block;
    }

    .radio {
      display: flex;
      gap: var(--sp-2);
      align-items: flex-start;
      padding: var(--sp-2);
      margin: 0 calc(-1 * var(--sp-2));
      border-radius: var(--radius);
      cursor: pointer;
      transition: background-color var(--dur-fast) var(--ease-out);
    }

    .radio:hover {
      background: var(--panel2);
    }

    /* Hover does not exist on touch, and a control that does not visibly take
       the press reads as broken and gets tapped twice. */
    .radio:active {
      background: var(--panel2);
    }

    .radio--disabled {
      cursor: default;
      opacity: 0.45;
    }

    .radio--disabled:hover,
    .radio--disabled:active {
      background: transparent;
    }

    .radio__input {
      /* accent-color paints the platform control in the theme's own hue, which
         keeps the native role, focus ring and arrow-key behaviour intact. */
      accent-color: var(--accent);
      width: 16px;
      height: 16px;
      margin: 0;
      flex: none;
      /* The label's own line-height is larger than the box, so nudge the dot
         onto the first baseline instead of the top of the line. */
      margin-top: 1px;
      cursor: inherit;
    }

    .radio__text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .radio__label {
      font-size: var(--fs-md);
      color: var(--text);
    }

    .radio__hint {
      font-size: var(--fs-sm);
      color: var(--muted-strong);
    }
  `,
})
export class UiRadio {
  /** Groups the options. Radios sharing a name are one set to the platform. */
  readonly name = input.required<string>();
  /** This option's value. Named to avoid colliding with the selection model. */
  readonly optionValue = input.required<string>();
  /** The set's current selection. Unset selects nothing — see the class docs. */
  readonly value = model<string | null>(null);
  readonly hint = input<string | null>(null);
  readonly disabled = input(false);
  /** Fires only on a real user pick, for callers that need the event itself. */
  readonly picked = output<string>();

  protected readonly checked = computed(() => this.value() === this.optionValue());

  protected pick(): void {
    if (this.disabled()) return;
    this.value.set(this.optionValue());
    this.picked.emit(this.optionValue());
  }
}
