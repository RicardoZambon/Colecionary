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
import { focusableIn } from '../focusable';
import { UiButton } from '../button/button';
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
  imports: [TPipe, UiButton, UiIcon],
  host: {
    '(document:keydown)': 'onKeydown($event)',
  },
  template: `
    @if (open()) {
      <div class="scrim" (click)="close()"></div>
      <div
        #panel
        class="panel"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="'ui.lightbox.title' | t"
      >
        <!--
          Tappable. It used to carry pointer-events: none, so on a phone the
          photograph — the largest thing on the screen and the first thing
          anyone tries — did nothing at all. A tap advances, which is the
          gesture the counter beside it already implies.
        -->
        <button
          type="button"
          class="picture"
          [disabled]="ids().length < 2"
          [attr.aria-label]="'ui.lightbox.next' | t"
          (click)="step(1)"
        >
          <img [src]="currentUrl()" [alt]="caption()" />
        </button>

        <div class="bar">
          <span class="counter">{{ 'ui.lightbox.counter' | t: { n: index() + 1, total: ids().length } }}</span>

          <div class="controls">
            <ui-button
              variant="ghost"
              size="sm"
              [disabled]="ids().length < 2"
              [ariaLabel]="'ui.lightbox.previous' | t"
              (click)="step(-1)"
            ><ui-icon name="chevron-left" [size]="13" /></ui-button>
            <ui-button
              variant="ghost"
              size="sm"
              [disabled]="ids().length < 2"
              [ariaLabel]="'ui.lightbox.next' | t"
              (click)="step(1)"
            ><ui-icon name="chevron-right" [size]="13" /></ui-button>
            <a
              class="original"
              [href]="originalUrl()"
              target="_blank"
              rel="noopener"
            >{{ 'ui.lightbox.original' | t }}</a>
            <ui-button
              variant="ghost"
              size="sm"
              [ariaLabel]="'ui.lightbox.close' | t"
              (click)="close()"
            ><ui-icon name="close" [size]="13" /></ui-button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    @use '../../../../styles/mixins' as *;

    .scrim {
      position: fixed;
      inset: 0;
      /* The token, not an 90/91 pair invented here. The literals put this
         overlay *above* app-conflict-notice, so a refused write raised while a
         photo was open had nowhere to be seen — and that notice is the only
         message saying a save did not happen. */
      z-index: var(--z-overlay);
      background: color-mix(in srgb, var(--bg) 88%, transparent);
    }

    .panel {
      position: fixed;
      inset: 24px;
      z-index: var(--z-modal);
      display: flex;
      flex-direction: column;
      gap: 12px;
      pointer-events: none;
    }

    .picture {
      flex: 1;
      min-height: 0;
      display: block;
      width: 100%;
      padding: 0;
      border: 0;
      background: none;
      /* A tap advances; the whole surface is the target. */
      cursor: pointer;
      pointer-events: auto;

      &:disabled {
        cursor: default;
      }

      img {
        display: block;
        /* contain, not cover: this is the one surface that must show the whole
           picture — every other one crops around the focal point. */
        object-fit: contain;
        width: 100%;
        height: 100%;
      }
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

    /* ui-button's own .btn rule paints these, so the pill dimensions have to
       outrank it — the doubled class is the same trick, and for the same
       reason, as ui-reorder's. */
    :host ::ng-deep .controls .btn.btn,
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

    /* On a phone this bar was a 19px-tall row of 10px pills at the bottom of
       the screen. ui-button already inherits the 44px min-height from
       styles.scss below the breakpoint; the anchor and the width are what is
       left. */
    @include upto($bp-lg) {
      :host ::ng-deep .controls .btn.btn,
      .original {
        min-height: var(--tap);
        min-width: var(--tap);
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

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

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
      const opener = document.activeElement as HTMLElement | null;
      queueMicrotask(() => focusableIn(this.panel()?.nativeElement ?? null)[0]?.focus());

      const previous = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      onCleanup(() => {
        document.body.style.overflow = previous;
        // Focus goes back where it came from. Without this, Escape left focus
        // on nothing: the next Tab restarted at the top of the document and a
        // screen reader announced the page rather than the button the user had
        // pressed to get here. Guarded on `isConnected` because the opener can
        // be gone — a photo removed from the very gallery that opened it.
        if (opener?.isConnected) opener.focus({ preventScroll: true });
      });
    });
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (!this.open()) return;

    if (event.key === 'Tab') {
      // The panel is `aria-modal` and had nothing enforcing it, so Tab walked
      // straight out into the page behind — which is still rendered and still
      // interactive.
      this.cycleFocus(event);
      return;
    }

    if (event.key === 'Escape') {
      this.contain(event);
      this.close();
      return;
    }
    if (event.key === 'ArrowLeft') {
      this.contain(event);
      this.step(-1);
      return;
    }
    if (event.key === 'ArrowRight') {
      this.contain(event);
      this.step(1);
    }
  }

  /**
   * Stops the key here.
   *
   * `preventDefault` alone is not enough: this is a document listener, and so
   * is `ItemPage`'s ← / → stepper, which is registered *first* because the
   * lightbox is a child of its template. Without `stopImmediatePropagation` a
   * press of → advanced the photo and stepped the page behind to the next item
   * at the same time.
   */
  private contain(event: KeyboardEvent): void {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  /** Wraps Tab and Shift+Tab inside the panel. */
  private cycleFocus(event: KeyboardEvent): void {
    const stops = focusableIn(this.panel()?.nativeElement ?? null);
    if (!stops.length) return;
    const first = stops[0];
    const last = stops[stops.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !this.panel()?.nativeElement.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
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
