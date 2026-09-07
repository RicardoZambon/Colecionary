import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'link' | 'icon';
export type ButtonSize = 'md' | 'sm';

/**
 * The one and only button. Every clickable action in the app goes through
 * this component so visual changes happen in exactly one place.
 */
@Component({
  selector: 'ui-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.block]': 'block()' },
  template: `
    <button
      [type]="type()"
      [disabled]="disabled() || pending()"
      [attr.aria-busy]="pending() || null"
      [attr.aria-disabled]="muted() || null"
      [attr.aria-label]="ariaLabel() || null"
      [attr.id]="controlId() || null"
      [attr.aria-expanded]="ariaExpanded() ?? null"
      [attr.aria-controls]="ariaControls() || null"
      [attr.title]="ariaLabel() || null"
      class="btn"
      [class.btn--primary]="variant() === 'primary'"
      [class.btn--ghost]="variant() === 'ghost'"
      [class.btn--danger]="variant() === 'danger'"
      [class.btn--link]="variant() === 'link'"
      [class.btn--icon]="variant() === 'icon'"
      [class.btn--muted]="muted()"
      [class.btn--pending]="pending()"
      [class.btn--sm]="size() === 'sm'"
      [class.btn--block]="block()"
    >
      <ng-content />
    </button>
  `,
  styles: `
    @use '../../../../styles/mixins' as *;

    :host {
      display: inline-block;
    }

    .btn {
      border-radius: var(--radius);
      padding: 9px 18px;
      font-size: 12.5px;
      font-family: var(--font-body);
      cursor: pointer;
      transition: border-color 0.15s, color 0.15s;

      &:disabled {
        cursor: default;
        opacity: 0.6;
      }
    }

    .btn--sm {
      padding: 7px 13px;
      font-size: 12px;
    }

    :host(.block) {
      display: block;
    }

    .btn--block {
      display: block;
      width: 100%;
    }

    .btn--primary {
      background: var(--accent);
      color: var(--accent-contrast);
      border: var(--bw) solid var(--accent);
      font-weight: 700;
      box-shadow: var(--btn-shadow);
    }

    .btn--ghost {
      background: transparent;
      color: var(--text2);
      border: var(--bw) solid var(--border);
      font-weight: 600;

      &:hover:not(:disabled) {
        border-color: var(--accent);
        color: var(--accent);
      }
    }

    /*
     * Destructive, and coloured by --danger rather than --warn. They used to be
     * the same token, which meant "Delete collection" and a Fair-condition
     * badge rendered identically — colour that marks two unrelated things marks
     * neither.
     */
    .btn--danger {
      background: transparent;
      color: var(--danger);
      border: var(--bw) solid var(--border);
      font-weight: 600;

      &:hover:not(:disabled) {
        border-color: var(--danger);
        background: color-mix(in srgb, var(--danger) 8%, transparent);
      }
    }

    /*
     * An action that reads as text rather than as a control — "add a subgroup",
     * "add a field" — sitting inside a row that is already dense with borders.
     * A fourth bordered box there would compete with the thing it acts on.
     */
    .btn--link {
      background: none;
      border: 0;
      padding: 0;
      font-size: 12px;
      font-weight: 600;
      /* Type, so the readable sibling: the raw accent is a fill token and
         measures 4.28:1 on --panel and 3.49:1 on --panel2 in paper. */
      color: var(--accent-strong);

      &:hover:not(:disabled) {
        text-decoration: underline;
      }
    }

    .btn--link.btn--sm {
      font-size: 11px;
      padding: 0;
    }

    /*
     * A bare mark — the ui-icon close that removes a copy, a field, a member.
     * Quiet until pointed at, then danger-coloured, because removal is the one
     * action here that cannot be undone by clicking again.
     *
     * The flex centring is what an inline svg needs: a button lays its content
     * out on a text baseline, so a block-level svg sat a couple of pixels low
     * and left a descender's worth of dead space under it.
     */
    .btn--icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: none;
      border: 0;
      padding: 2px 4px;
      min-width: 20px;
      font-size: 13px;
      line-height: 1;
      /* The x that removes a copy, a field or a member is a control, not
         decoration — and on a phone there is no hover to reveal it, so the
         resting state is the only state. */
      color: var(--muted-strong);

      &:hover:not(:disabled) {
        color: var(--danger);
      }
    }

    .btn--icon.btn--sm {
      font-size: 11px;
      padding: 1px 3px;
    }

    /*
     * In progress. The ring is drawn from currentColor, so it works on all five
     * variants without a second token, and it sits *before* the label so the
     * label does not have to change — which is the whole point: three callers
     * each carried a second i18n key ("Retrying…", "Reloading…") to say this,
     * and the fourth simply greyed out and said nothing.
     */
    .btn--pending {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--sp-2);

      &::before {
        content: '';
        flex: none;
        width: 11px;
        height: 11px;
        border: 2px solid currentColor;
        /* One transparent quarter is what makes the rotation visible; at
           reduced motion it is a static broken ring, which still reads as
           "not finished" without anything moving. */
        border-right-color: transparent;
        border-radius: 50%;
      }
    }

    @include motion-safe {
      .btn--pending::before {
        animation: ui-btn-spin 0.7s linear infinite;
      }
    }

    @keyframes ui-btn-spin {
      to {
        transform: rotate(360deg);
      }
    }

    /*
     * Looks unavailable, still focusable. The disabled attribute would be the
     * obvious thing and is the wrong one twice over: a dead control cannot say
     * why — and these are the cases with something to say, like refusing to
     * remove the account's owner — and the browser blows focus off an element
     * the moment it becomes disabled, which loses a keyboard user their place
     * exactly when a control at the end of a list stops being available.
     * aria-disabled on the element above is the other half: without it the
     * state was carried by colour alone.
     */
    .btn--muted:not(:disabled) {
      color: var(--border);
      cursor: default;

      &:hover {
        color: var(--border);
        border-color: var(--border);
        text-decoration: none;
      }
    }
  `,
})
export class UiButton {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');
  readonly disabled = input(false);
  readonly type = input<'button' | 'submit'>('button');
  /**
   * Accessible name for buttons whose content is a bare mark (a `ui-icon`). Also
   * becomes the tooltip, so the meaning is reachable by mouse too.
   */
  readonly ariaLabel = input('');
  /**
   * For a button that discloses something — the nav drawer's hamburger.
   *
   * These have to land on the real inner `<button>`, not on the `<ui-button>`
   * host: the host is not focusable and carries no role, so assistive
   * technology never reaches an attribute placed there. Without these inputs a
   * caller has to reach into the DOM after render to set them, which is exactly
   * what `Topbar` was doing.
   */
  readonly ariaExpanded = input<boolean | undefined>(undefined);
  readonly ariaControls = input('');
  /** An id on the inner button, so something else can point focus back at it. */
  readonly controlId = input('');
  /** Stretch to the full width of the container (e.g. plan cards). */
  readonly block = input(false);
  /**
   * The soft disable: reads and announces as unavailable, keeps the browser's
   * `disabled` off it.
   *
   * Two things follow, and both are the point. It stays **focusable**, so a
   * keyboard user is not thrown to `<body>` when the control they are pressing
   * becomes unavailable — the end of a reorderable list is exactly that case.
   * And it still **fires**, so a refusal can say why (removing the account's
   * owner). A caller for which the act is genuinely a no-op at that moment
   * simply returns; what the click does is the caller's business, and either
   * way the user is told what the state is rather than shown a dimmer colour.
   *
   * Use plain `disabled` where the control is unavailable *and* nothing needs
   * saying *and* nobody is standing on it — a submit button under an empty
   * form.
   */
  readonly muted = input(false);

  /**
   * This button's own write is in flight.
   *
   * It implies `disabled` — a write affordance must stop offering itself while
   * it runs (CLAUDE.md rule 20: two writes quoting the same version means the
   * second is refused with a 412 nobody can act on, and half a second is
   * enough for a double click). It also sets `aria-busy`, so the state is
   * announced rather than merely dimmed, and draws a spinner, so "in progress"
   * does not need a second label.
   *
   * Bind it from `VaultStore.saving(id)`, passed down as an input — never by
   * injecting the store into a leaf.
   */
  readonly pending = input(false);
}
