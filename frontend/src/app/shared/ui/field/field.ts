import { ChangeDetectionStrategy, Component, computed, forwardRef, input } from '@angular/core';

import { UI_FIELD_OWNER, UiFieldOwner } from './field-control';

let nextId = 0;

/**
 * Label + control layout used by every form field.
 *
 * **The label actually labels.** The field mints an id, points its `<label
 * for>` at it, and hands it to the control it wraps through
 * {@link UI_FIELD_OWNER} — so nesting a `ui-*` control inside a `ui-field` is
 * the whole association, with nothing to remember at the call site. Before
 * this, every label in the app was decoration: clicking one did nothing and
 * assistive technology announced the control as unnamed.
 *
 * The `hint` and the `error` are wired into the control's `aria-describedby`
 * the same way, so a note that is drawn is also a note that is spoken, and an
 * `error` additionally marks the control `aria-invalid`.
 */
@Component({
  selector: 'ui-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: UI_FIELD_OWNER, useExisting: forwardRef(() => UiField) }],
  template: `
    <label class="label" [attr.for]="controlId() || id">{{ label() }}</label>
    <ng-content />
    @if (hint()) {
      <span class="hint" [id]="hintId">{{ hint() }}</span>
    }
    @if (error()) {
      <!-- role=alert on an element created together with its text is the one
           live-region shape screen readers reliably catch on insertion, which
           is what a refusal needs: the user is looking at the button they just
           pressed, not at this line. -->
      <span class="error" role="alert" [id]="errorId">{{ error() }}</span>
    }
  `,
  styles: `
    @use '../../../../styles/mixins' as *;

    :host {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    /*
     * The shared micro-heading, not a local copy of it. The old rule was 10px
     * of --muted, which measured 2.73:1 in the default theme — the faintest and
     * smallest text on the screen was the one saying what every field is for.
     */
    .label {
      @include mono-label(var(--fs-xs), 0.1em);
      text-transform: uppercase;
    }

    .hint {
      font-size: 11.5px;
      color: var(--text2);
    }

    /*
     * --danger, and never colour alone: the message itself is the marker, which
     * is what survives a greyscale screenshot and a colour-blind reader.
     */
    .error {
      font-size: 11.5px;
      font-weight: 600;
      color: var(--danger);
    }
  `,
})
export class UiField implements UiFieldOwner {
  readonly label = input.required<string>();

  /**
   * Optional note under the control, for what the field does rather than what
   * it is called — "leave empty to follow the account", say. Empty renders
   * nothing, so existing fields are untouched.
   */
  readonly hint = input('');

  /**
   * Why the value in this control was refused, in the user's language.
   *
   * Rendered under the control, announced on insertion, and it marks the
   * control `aria-invalid` — so the answer to "why did nothing happen" is on
   * the field the user has to change, not in a pill in the opposite corner
   * that expires while they are still reading the form.
   *
   * State the outcome ("Give the item a name before saving"), not the rule
   * ("Field required"). Empty means no error, which is the default.
   */
  readonly error = input('');

  /**
   * Names the control this field labels, when the page already has an id for
   * it — a `<form>` that points elsewhere at it, say. Otherwise the field mints
   * one. Set it here rather than on the control: the label's `for` and the
   * control's `id` come from the same place by construction, so they cannot
   * drift apart.
   */
  readonly controlId = input('');

  /** Unique per instance, so two fields on one page cannot share an aria target. */
  protected readonly id = `fld-${nextId++}`;
  protected readonly hintId = `${this.id}-hint`;
  protected readonly errorId = `${this.id}-err`;

  /**
   * Which control currently holds the minted id, or null.
   *
   * The identity and not a boolean: a control that is destroyed hands the claim
   * back, and only the holder may do that — see {@link UiFieldOwner.claimId}.
   */
  private claimant: object | null = null;

  /** @see UiFieldOwner.claimId */
  claimId(claimant: object): string | null {
    if (this.claimant && this.claimant !== claimant) return null;
    this.claimant = claimant;
    return this.controlId() || this.id;
  }

  /** @see UiFieldOwner.releaseId */
  releaseId(claimant: object): void {
    if (this.claimant === claimant) this.claimant = null;
  }

  /** The hint and the error, in reading order — the error last, being the news. */
  readonly describedBy = computed(() =>
    [this.hint() ? this.hintId : '', this.error() ? this.errorId : ''].filter(Boolean).join(' '),
  );

  readonly invalid = computed(() => !!this.error());
}
