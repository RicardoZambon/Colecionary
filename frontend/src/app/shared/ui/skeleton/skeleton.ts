import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type SkeletonVariant = 'text' | 'block' | 'circle';

/**
 * The one thing in this app that is allowed to shimmer.
 *
 * That restriction is the whole point of the component. Three of the most
 * important surfaces — dashboard cards, store cards, group cards — used to
 * render a diagonal-stripe placeholder wherever a photo was missing, and a
 * moving-looking hatch is indistinguishable from a loading shimmer, so a
 * finished collection with no cover photo read as permanently mid-fetch. The
 * app now says exactly one of two things: *this is still arriving* (a
 * skeleton, here) or *there is nothing here* (`ui-empty`, `ui-image-slot`'s
 * flat placeholder). Never a shape that could be either.
 *
 * A skeleton is `aria-hidden` and carries no accessible name: it is a picture
 * of a layout, not content. The **region** that is loading owns `aria-busy`
 * and the live announcement — a screen-reader user hearing "loading" once from
 * the container is served; hearing eleven unnamed graphics is not.
 *
 * The sweep runs only inside `motion-safe`. With reduced motion the skeleton
 * is a flat `--panel2` block, which still communicates "not yet" through
 * position and shape.
 */
@Component({
  selector: 'ui-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[class]': '"v-" + variant()',
  },
  template: `
    @for (line of lineList(); track $index) {
      <span
        class="bar"
        [style.width]="line.width"
        [style.height]="height()"
        [style.border-radius]="radius()"
      ></span>
    }
  `,
  styles: `
    @use '../../../../styles/mixins' as *;

    :host {
      display: flex;
      flex-direction: column;
      gap: var(--sp-2);
      width: 100%;
    }

    :host(.v-circle) {
      display: inline-flex;
      width: auto;
    }

    .bar {
      display: block;
      /* Flat by default. The sweep below is an enhancement, so a
         reduced-motion user still gets a legible placeholder rather than an
         invisible one. */
      background: var(--panel2);
      border: var(--bw) solid transparent;
      flex: none;
    }

    :host(.v-text) .bar {
      height: 0.72em;
      border-radius: var(--pill);
    }

    :host(.v-block) .bar {
      height: 100%;
      min-height: var(--sp-12);
      border-radius: var(--radius);
    }

    :host(.v-circle) .bar {
      width: var(--sp-8);
      height: var(--sp-8);
      border-radius: var(--pill);
    }

    @include motion-safe {
      .bar {
        /* One highlight pass over the base surface. Both stops are tokens, so a
           theme with a light panel gets a light shimmer and no theme has to
           opt out. */
        background-image: linear-gradient(
          90deg,
          transparent 0%,
          color-mix(in srgb, var(--text) 9%, transparent) 50%,
          transparent 100%
        );
        background-repeat: no-repeat;
        background-size: 220% 100%;
        animation: ui-skeleton-sweep 1.4s var(--ease-in-out) infinite;
      }
    }

    @keyframes ui-skeleton-sweep {
      from {
        background-position: -110% 0;
      }
      to {
        background-position: 210% 0;
      }
    }
  `,
})
export class UiSkeleton {
  readonly variant = input<SkeletonVariant>('text');
  /**
   * Overrides the variant's width. On a `text` skeleton with several lines this
   * is the width of every line but the last, which is always short — a
   * paragraph whose lines all end flush reads as a table, not as prose.
   */
  readonly width = input<string | null>(null);
  readonly height = input<string | null>(null);
  readonly radius = input<string | null>(null);
  /** Text lines to draw. Ignored by the other variants. */
  readonly lines = input(1);

  protected readonly lineList = computed(() => {
    const count = this.variant() === 'text' ? Math.max(1, Math.floor(this.lines())) : 1;
    const width = this.width();
    return Array.from({ length: count }, (_, i) => ({
      // The closing line of a multi-line paragraph stops short.
      width: count > 1 && i === count - 1 ? '62%' : (width ?? '100%'),
    }));
  });
}
