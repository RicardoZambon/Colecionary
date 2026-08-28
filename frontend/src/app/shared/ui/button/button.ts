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
      [disabled]="disabled()"
      [attr.aria-label]="ariaLabel() || null"
      [attr.title]="ariaLabel() || null"
      class="btn"
      [class.btn--primary]="variant() === 'primary'"
      [class.btn--ghost]="variant() === 'ghost'"
      [class.btn--danger]="variant() === 'danger'"
      [class.btn--link]="variant() === 'link'"
      [class.btn--icon]="variant() === 'icon'"
      [class.btn--muted]="muted()"
      [class.btn--sm]="size() === 'sm'"
      [class.btn--block]="block()"
    >
      <ng-content />
    </button>
  `,
  styles: `
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

    .btn--danger {
      background: transparent;
      color: var(--warn);
      border: var(--bw) solid var(--border);
      font-weight: 600;

      &:hover:not(:disabled) {
        border-color: var(--warn);
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
      color: var(--accent);

      &:hover:not(:disabled) {
        text-decoration: underline;
      }
    }

    .btn--link.btn--sm {
      font-size: 11px;
      padding: 0;
    }

    /*
     * A bare glyph — the ✕ that removes a copy, a field, a member. Quiet until
     * pointed at, then warn-coloured, because removal is the one action here
     * that cannot be undone by clicking again.
     */
    .btn--icon {
      background: none;
      border: 0;
      padding: 2px 4px;
      min-width: 20px;
      font-size: 13px;
      line-height: 1;
      color: var(--muted);

      &:hover:not(:disabled) {
        color: var(--warn);
      }
    }

    .btn--icon.btn--sm {
      font-size: 11px;
      padding: 1px 3px;
    }

    /*
     * Looks unavailable, still clicks. The disabled attribute would be the
     * obvious thing and is the wrong one: a dead control cannot say why, and
     * these are the cases with something to say — removing the tenant's owner,
     * for instance. The click is what surfaces the explanation.
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
   * Accessible name for buttons whose content is a bare glyph (↑ ↓ ✕). Also
   * becomes the tooltip, so the meaning is reachable by mouse too.
   */
  readonly ariaLabel = input('');
  /** Stretch to the full width of the container (e.g. plan cards). */
  readonly block = input(false);
  /**
   * Reads as unavailable but still fires. For actions that are refused with a
   * reason the user deserves to hear — see the styles for why this is not
   * `disabled`.
   */
  readonly muted = input(false);
}
