import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * A progress track with an optional second, dimmer band behind the fill.
 *
 * The two bands exist because a collection has two kinds of shortfall at once:
 * what you own, and what you have merely catalogued. Drawing them on one track
 * shows both against the same denominator without a legend. Two shades of one
 * hue is a colour-only distinction, so the numbers a caller prints beside the
 * bar are not decoration — they are the accessible encoding, and `label` /
 * `valueText` carry the same information to a screen reader.
 */
@Component({
  selector: 'ui-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"size-" + size()' },
  template: `
    <div
      class="track"
      role="progressbar"
      [attr.aria-label]="label()"
      [attr.aria-valuetext]="valueText()"
      [attr.aria-valuenow]="clampedPct()"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      @if (clampedSecondary() !== null) {
        <div class="band" [style.width.%]="clampedSecondary()"></div>
      }
      <div class="fill" [style.width.%]="clampedPct()"></div>
    </div>
  `,
  styles: `
    .track {
      position: relative;
      height: 5px;
      background: var(--panel2);
      border-radius: var(--pill);
      overflow: hidden;
    }

    :host(.size-sm) .track {
      height: 3px;
    }

    .fill,
    .band {
      position: absolute;
      inset-block: 0;
      left: 0;
    }

    .fill {
      background: var(--accent);
    }

    /* Sits behind the fill and reads as "listed, not held". Hatched as well as
       dimmed, so the two bands stay apart in a high-contrast or monochrome
       theme where opacity alone would collapse them. */
    .band {
      background: repeating-linear-gradient(
        45deg,
        color-mix(in srgb, var(--accent) 34%, transparent) 0 3px,
        transparent 3px 6px
      );
    }
  `,
})
export class UiProgress {
  /** 0–100. Values outside the range are clamped rather than overflowing. */
  readonly pct = input.required<number>();
  /**
   * A second, dimmer band drawn behind the fill — typically how much is
   * catalogued against the same denominator. Null draws a plain single bar.
   */
  readonly secondaryPct = input<number | null>(null);
  readonly size = input<'sm' | 'md'>('md');
  /** Accessible name. Required in practice — many bars share one screen. */
  readonly label = input<string | null>(null);
  /** What a screen reader says instead of a bare percentage. */
  readonly valueText = input<string | null>(null);

  protected readonly clampedPct = computed(() => clamp(this.pct()));
  protected readonly clampedSecondary = computed(() => {
    const secondary = this.secondaryPct();
    if (secondary === null) return null;
    // Never behind the fill: a band shorter than what it sits behind would
    // read as the collection shrinking.
    return Math.max(clamp(secondary), this.clampedPct());
  });
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}
