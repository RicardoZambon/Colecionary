import {
  DestroyRef,
  Directive,
  ElementRef,
  InjectionToken,
  Signal,
  computed,
  inject,
  input,
  viewChild,
} from '@angular/core';

let nextControlId = 0;

/**
 * What a `ui-field` offers the control it wraps.
 *
 * The control asks the field for these rather than the field reaching into the
 * control, because the field has no idea what it is wrapping: an `<input>`, a
 * `<select>`, a `role="switch"` button. All three need the same three facts and
 * only they know where to put them.
 */
export interface UiFieldOwner {
  /**
   * Hands out the id the field's `<label for>` points at — to **one** control
   * at a time.
   *
   * A *second, coexisting* control inside the same `ui-field` gets `null` and
   * falls back to its own generated id, because two elements sharing an id is
   * worse than one of them being unlabelled: it makes the *first* label
   * ambiguous too (ADR-78).
   *
   * "At a time" is the part that was missing. The claim used to be permanent,
   * so a control *swapped* inside a field — an `@if`/`@else` on a custom
   * field's declared type, which flips the moment the item form's group select
   * moves to a group that types the same field name differently — handed the id
   * to a destroyed element and left the label pointing at nothing. The claimant
   * identifies itself so the release can only ever clear its own claim, never
   * one already handed on.
   */
  claimId(claimant: object): string | null;
  /**
   * Gives the id back, so the next control in this field can have it.
   *
   * A no-op unless `claimant` is the one currently holding it: Angular destroys
   * the outgoing view before it creates the incoming one, but a release that
   * did not check would, in the other order, take the id off a control that had
   * just legitimately claimed it.
   */
  releaseId(claimant: object): void;
  /** Space-separated ids of the field's hint and error, or `''`. */
  readonly describedBy: Signal<string>;
  /** True while the field is showing an error message. */
  readonly invalid: Signal<boolean>;
}

/** How a projected control finds the `ui-field` it was written inside. */
export const UI_FIELD_OWNER = new InjectionToken<UiFieldOwner>('ui-field owner');

/**
 * Everything a form control in this library owes its label, its hint and its
 * error message — plus the one thing a parent needs from it, `focus()`.
 *
 * Extend it, and name the real focusable element `#control` in the template:
 *
 * ```html
 * <input #control [attr.id]="fieldId()" [attr.aria-describedby]="ariaDescribedBy()" />
 * ```
 *
 * **Why a base class rather than a copy per control.** Seven controls need an
 * id, a `describedBy` and an `aria-invalid`, and the app went a year with none
 * of them: `ui-field` drew a `<label>` with no `for`, no control accepted an
 * id, so 29 of 32 controls announced as unnamed and no call site *could* fix
 * it. One place to get it right is the only version of this that stays right.
 *
 * **Nothing changes at a call site.** A control written inside a `ui-field`
 * finds it through {@link UI_FIELD_OWNER} — the element injector follows the
 * template it was *written* in, not where it is projected — so the association
 * happens because the two are nested, which is what an author already
 * expresses by nesting them.
 *
 * Precedence for the id: the enclosing field's (so its `<label for>` can never
 * point at the wrong element), then this control's own `controlId` for the
 * fields that live outside a `ui-field`, then a generated one. Name a field's
 * control through `ui-field`'s own `controlId`, not through this one.
 */
@Directive()
export abstract class UiFieldControl {
  private readonly owner = inject(UI_FIELD_OWNER, { optional: true });

  /**
   * The real focusable element. Every subclass names it `#control`; without it
   * {@link focus} is a no-op rather than an error, because a control that
   * forgot the ref should not break the page that renders it.
   */
  protected readonly control = viewChild<ElementRef<HTMLElement>>('control');

  /**
   * An id for the inner control, for a field the page labels itself. Inside a
   * `ui-field` the field's own id wins — set `[controlId]` on the `ui-field`
   * instead, so the label and the control cannot disagree.
   */
  readonly controlId = input('');

  /**
   * Extra ids to announce after the control's own name — a sentence elsewhere
   * on the page that explains the field. The enclosing `ui-field`'s hint and
   * error are added automatically and do not need naming here.
   */
  readonly describedBy = input('');

  /**
   * Marks the control as holding a rejected value. Prefer putting the message
   * on the enclosing `ui-field` (`[error]`), which sets this for free — a state
   * with no statement of what is wrong is a dead end for everybody.
   */
  readonly invalid = input(false);

  /** Claimed at construction, so the id is stable for the element's lifetime. */
  private readonly claimedId = this.owner?.claimId(this) ?? null;
  private readonly generatedId = `ui-ctl-${nextControlId++}`;

  constructor() {
    // Handed back on destroy — see UiFieldOwner.claimId. Without it the label of
    // a field whose control is swapped keeps pointing at the element that was
    // removed, so clicking the label does nothing and the new control announces
    // as unnamed. Field initialisers all run before this body, so `claimedId`
    // above has already been taken by the time the release is registered.
    inject(DestroyRef).onDestroy(() => this.owner?.releaseId(this));
  }

  /** The id that actually lands on the control. See the class note for why. */
  protected readonly fieldId = computed(
    () => this.claimedId || this.controlId() || this.generatedId,
  );

  /** `aria-describedby` for the control, or null when there is nothing to say. */
  protected readonly ariaDescribedBy = computed(() => this.describedIds().join(' ') || null);

  /** `aria-invalid`, or null — the attribute is absent rather than false. */
  protected readonly ariaInvalid = computed(() =>
    this.invalid() || this.owner?.invalid() ? 'true' : null,
  );

  /**
   * The ids this control points `aria-describedby` at, for a subclass that has
   * one of its own to add — `ui-date-input`'s format hint, which must be
   * announced *as well as* the field's, not instead of it.
   */
  protected describedIds(): string[] {
    const own = this.describedBy().trim();
    const field = this.owner?.describedBy().trim() ?? '';
    return [own, field].filter(Boolean);
  }

  /**
   * Puts the caret in this control.
   *
   * The reason it exists: `autofocus` is honoured only on initial page load and
   * does nothing to content inserted later, which is every inline composer in
   * this app. A parent that reveals a field must focus it explicitly, from an
   * `afterNextRender` or a microtask after the reveal, and until now it could
   * not — so it either reached into the rendered DOM or shipped an unfocused
   * box.
   */
  focus(options?: FocusOptions): void {
    this.control()?.nativeElement.focus(options);
  }

  /**
   * Focuses and selects the existing text, for a box that opens on a value the
   * user is replacing rather than extending — an inline rename. A no-op on the
   * controls with nothing to select.
   */
  selectAll(): void {
    const el = this.control()?.nativeElement as HTMLElement & { select?: () => void };
    if (!el) return;
    el.focus();
    el.select?.();
  }
}
