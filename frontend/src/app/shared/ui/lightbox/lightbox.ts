import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  viewChild,
} from '@angular/core';

import { ImagesApi } from '../../../core/api/images-api';
import { I18nService } from '../../../core/i18n';
import { TPipe } from '../../pipes/t.pipe';
import { UiIcon } from '../icon/icon';

/**
 * Full-screen viewer for a set of photos.
 *
 * The complaint that started this work — "a large upload shows badly" — was
 * really two: the app downloaded originals to draw them small, *and* it had
 * nowhere to show a photo properly. Right-sizing the bytes fixes the first.
 * This fixes the second: a picture in a collection catalogue is the thing being
 * catalogued, and it deserves more than a 380px tile.
 *
 * Renders `display` and offers the original behind a link rather than loading
 * it. A 4 MB file is worth downloading when someone asks to inspect the print
 * quality of a card, and not before.
 */
@Component({
  selector: 'ui-lightbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe, UiIcon],
  host: {
    '(document:keydown)': 'onKeydown($event)',
  },
  template: `
    @if (open()) {
      <div class="scrim" (click)="close()"></div>
      <div
        class="panel"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="'ui.lightbox.title' | t"
      >
        <img class="picture" [src]="currentUrl()" [alt]="caption()" />

        <div class="bar">
          <span class="counter">{{ 'ui.lightbox.counter' | t: { n: index() + 1, total: ids().length } }}</span>

          <div class="controls">
            <button
              #first
              type="button"
              [disabled]="ids().length < 2"
              [attr.aria-label]="'ui.lightbox.previous' | t"
              (click)="step(-1)"
            ><ui-icon name="chevron-left" [size]="13" /></button>
            <button
              type="button"
              [disabled]="ids().length < 2"
              [attr.aria-label]="'ui.lightbox.next' | t"
              (click)="step(1)"
            ><ui-icon name="chevron-right" [size]="13" /></button>
            <a
              class="original"
              [href]="originalUrl()"
              target="_blank"
              rel="noopener"
            >{{ 'ui.lightbox.original' | t }}</a>
            <button type="button" [attr.aria-label]="'ui.lightbox.close' | t" (click)="close()">
              <ui-icon name="close" [size]="13" />
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .scrim {
      position: fixed;
      inset: 0;
      z-index: 90;
      background: color-mix(in srgb, var(--bg) 88%, transparent);
    }

    .panel {
      position: fixed;
      inset: 24px;
      z-index: 91;
      display: flex;
      flex-direction: column;
      gap: 12px;
      pointer-events: none;
    }

    .picture {
      flex: 1;
      min-height: 0;
      /* contain, not cover: this is the one surface that must show the whole
         picture — every other one crops around the focal point. */
      object-fit: contain;
      width: 100%;
      pointer-events: none;
    }

    .bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      padding: 8px 12px;
      background: var(--panel);
      border: var(--bw) solid var(--border);
      border-radius: var(--radius);
      pointer-events: auto;
    }

    .counter {
      font-family: var(--font-mono);
      font-size: 10px;
      letter-spacing: 0.1em;
      color: var(--muted);
    }

    .controls {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    button,
    .original {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 4px 10px;
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--text2);
      text-decoration: none;
      background: var(--panel2);
      border: var(--bw) solid var(--border);
      border-radius: var(--pill);
      cursor: pointer;

      &:hover:not(:disabled) {
        color: var(--accent);
        border-color: var(--accent);
      }

      &:disabled {
        opacity: 0.45;
        cursor: default;
      }
    }
  `,
})
export class UiLightbox {
  private readonly images = inject(ImagesApi);
  private readonly i18n = inject(I18nService);

  readonly ids = input.required<readonly string[]>();
  /** Names the picture for a screen reader — the item's name, typically. */
  readonly subject = input('');
  /** Which photo is showing. Two-way, so the page's gallery follows along. */
  readonly index = model(0);
  readonly open = model(false);
  readonly closed = output<void>();

  private readonly firstControl = viewChild<ElementRef<HTMLButtonElement>>('first');

  protected readonly currentUrl = computed(() =>
    this.images.url(this.ids()[this.index()], 'display'),
  );
  protected readonly originalUrl = computed(() =>
    this.images.url(this.ids()[this.index()], 'full'),
  );
  protected readonly caption = computed(() =>
    this.i18n.t('ui.lightbox.caption', {
      subject: this.subject(),
      n: this.index() + 1,
      total: this.ids().length,
    }),
  );

  constructor() {
    effect(onCleanup => {
      if (!this.open()) return;
      // Moving focus into the dialog is what makes Escape and the arrows reach
      // it at all — without this the keydown handler fires on whatever the page
      // had focused, and a screen reader never announces the dialog opened.
      queueMicrotask(() => this.firstControl()?.nativeElement.focus());

      const previous = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      onCleanup(() => {
        document.body.style.overflow = previous;
      });
    });
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (!this.open()) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.step(-1);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.step(1);
    }
  }

  /** Wraps around: at the last photo, "next" returns to the first. */
  protected step(delta: -1 | 1): void {
    const count = this.ids().length;
    if (count < 2) return;
    this.index.set((this.index() + delta + count) % count);
  }

  protected close(): void {
    this.open.set(false);
    this.closed.emit();
  }
}
