import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { IconName, UiIcon } from '../icon/icon';

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
 *
 * **With no photos it says "empty", not "loading".** The fallback used to be
 * the `stripes` hatch, which is the silhouette of a skeleton shimmer — and
 * since most group cards have no cover photo, most of the group grid read as
 * permanently mid-fetch. It is now a flat `--panel2` field with a dimmed mark,
 * matching `ui-image-slot`; a sweep now means one thing and one thing only,
 * and it lives in `ui-skeleton`.
 */
@Component({
  selector: 'ui-mosaic',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiIcon],
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
      <div class="empty">
        <ui-icon class="empty__mark" [name]="icon()" [size]="30" [strokeWidth]="1.5" />
        @if (placeholder()) {
          <span>{{ placeholder() }}</span>
        }
      </div>
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
      background: var(--panel2);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--sp-1);
      padding: 0 var(--sp-3);
      text-align: center;

      &__mark {
        color: var(--muted-strong);
        /* The mark is decoration; the name below it is the message and stays at
           full strength. */
        opacity: 0.4;
      }

      span {
        font-family: var(--font-mono);
        font-size: var(--fs-xs);
        letter-spacing: 0.08em;
        color: var(--muted-strong);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 100%;
      }
    }
  `,
})
export class UiMosaic {
  readonly tiles = input.required<MosaicTile[]>();
  /** Shown when there is nothing to display. */
  readonly placeholder = input('');
  /** The mark drawn above the placeholder label. */
  readonly icon = input<IconName>('image');
  readonly dim = input(false);

  /** The layouts stop at four; more tiles would each be too small to read. */
  protected readonly shown = computed(() => this.tiles().slice(0, 4));
}
