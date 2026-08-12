import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'ghost' | 'danger';
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
}
