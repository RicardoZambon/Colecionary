import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface MosaicTile {
  src: string;
  /** CSS `background-position`, from `ImageFocusService.position(id)`. */
  position: string;
}

/**
 * A cover built from several photos — what a group looks like at a glance.
 *
 * Presentational only: it never touches `ImagesApi`, exactly like
 * `ui-image-slot`. The page resolves ids to urls and framing and hands tiles
 * over. Every tile is `background-size: cover` plus one `background-position`,
 * which is the standing rule for images in this app; this component is where
 * that rule is written down for the multi-image case.
 *
 * Decorative by construction — `aria-hidden`, because the accessible name
 * belongs to whatever link wraps the cover.
 */
@Component({
  selector: 'ui-mosaic',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', '[class.dim]': 'dim()' },
  template: `
    @if (shown().length) {
      <div class="grid" [attr.data-count]="shown().length">
        @for (tile of shown(); track $index) {
          <div
            class="tile"
            [style.background-image]="'url(' + tile.src + ')'"
            [style.background-position]="tile.position"
          ></div>
        }
      </div>
    } @else {
      <div class="empty">{{ placeholder() }}</div>
    }
  `,
  styles: `
    @use '../../../../styles/mixins' as *;

    :host {
      display: block;
      position: relative;
      overflow: hidden;
    }

    /* Nothing owned yet: the same two cues the item card and the item page
       use, at the same strength, so an untouched group reads the same way an
       untouched item does. */
    :host(.dim) {
      @include wanted-photo;
    }

    .grid {
      position: absolute;
      inset: 0;
      display: grid;
      gap: 1px;
      background: var(--border);
    }

    .grid[data-count='1'] {
      grid-template-columns: 1fr;
    }

    .grid[data-count='2'] {
      grid-template-columns: 1fr 1fr;
    }

    /* One hero plus two stacked beside it — a plain 3-up strip makes each
       photo too narrow to recognise at card width. */
    .grid[data-count='3'] {
      grid-template-columns: 2fr 1fr;
      grid-template-rows: 1fr 1fr;

      .tile:first-child {
        grid-row: span 2;
      }
    }

    .grid[data-count='4'] {
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr 1fr;
    }

    .tile {
      background-size: cover;
      background-repeat: no-repeat;
    }

    .empty {
      position: absolute;
      inset: 0;
      @include stripes;
      display: grid;
      place-items: center;
      padding: 0 12px;
      text-align: center;
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--muted);
    }
  `,
})
export class UiMosaic {
  readonly tiles = input.required<MosaicTile[]>();
  /** Shown when there is nothing to display. */
  readonly placeholder = input('');
  readonly dim = input(false);

  /** The layouts stop at four; more tiles would each be too small to read. */
  protected readonly shown = computed(() => this.tiles().slice(0, 4));
}
