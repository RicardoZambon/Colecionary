import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';

import { ImageFocusService } from '../../../core/state/image-focus.service';
import { FocalPoint } from '../../../core/models';
import { clampFocal, focalFromPoint, focalToPosition } from '../../../core/utils/focal.util';
import { UiButton } from '../button/button';

/** How far an arrow key nudges the point, and how far with Shift held. */
const STEP = 0.01;
const COARSE_STEP = 0.1;

/**
 * The surfaces that crop this image, at their real aspect ratios. Previewing
 * all of them at once is the whole point: one focal point has to satisfy every
 * one, so the user needs to see the trade-off as they make it.
 */
const SURFACES: readonly { label: string; ratio: number; banner?: boolean }[] = [
  { label: 'Item card', ratio: 215 / 116 },
  { label: 'Item gallery', ratio: 380 / 300 },
  { label: 'Dashboard card', ratio: 330 / 70 },
  { label: 'Collection banner', ratio: 1000 / 150, banner: true },
];

/**
 * Editor for an image's focal point — which part of the picture every surface
 * crops around.
 *
 * Mounted once in the shell and driven by `ImageFocusService`, the same
 * arrangement as `ui-toast`. It carries its own overlay because the app has no
 * modal primitive yet; when a second modal appears, that overlay is what to
 * extract into `ui-modal`.
 *
 * Nothing here touches the bytes: the result is two numbers, applied at render
 * time as a `background-position`.
 */
@Component({
  selector: 'ui-image-focus',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiButton],
  host: { '(document:keydown.escape)': 'cancel()' },
  template: `
    @if (focus.pending(); as request) {
      <div class="scrim" (click)="cancel()"></div>
      <div class="panel" role="dialog" aria-modal="true" aria-label="Choose what to show">
        <header>
          <h2>Choose what to show</h2>
          <p>Drag the target onto what matters. Every size crops around it.</p>
        </header>

        <div class="body">
          <div
            class="stage"
            (pointerdown)="onPointerDown($event)"
            (pointermove)="onPointerMove($event)"
            (pointerup)="endDrag($event)"
            (pointercancel)="endDrag($event)"
          >
            <img #source [src]="request.url" alt="" draggable="false" />
            <button
              #target
              type="button"
              class="target"
              [style.left.%]="draft().x * 100"
              [style.top.%]="draft().y * 100"
              [attr.aria-label]="targetLabel()"
              (keydown)="onKeydown($event)"
            ></button>
          </div>

          <div class="previews">
            @for (surface of surfaces; track surface.label) {
              <div class="preview">
                <span class="preview__label">{{ surface.label }}</span>
                <div
                  class="preview__frame"
                  [style.aspect-ratio]="surface.ratio"
                  [style.background-image]="'url(' + request.url + ')'"
                  [style.background-position]="position()"
                >
                  @if (surface.banner) {
                    <!-- The collection banner is overlapped by the page header and
                         faded into the background, so its bottom ~45% is never
                         really seen. Framing something down there would put the
                         subject behind the chrome. -->
                    <div class="preview__fade"></div>
                    <div class="preview__covered">covered by header</div>
                  }
                </div>
              </div>
            }
          </div>
        </div>

        <footer>
          <span class="coords">{{ targetLabel() }}</span>
          <div class="actions">
            <ui-button variant="ghost" (click)="reset()">Reset</ui-button>
            <ui-button variant="ghost" (click)="cancel()">Cancel</ui-button>
            <ui-button variant="primary" (click)="save()">Save framing</ui-button>
          </div>
        </footer>
      </div>
    }
  `,
  styles: `
    .scrim {
      position: fixed;
      inset: 0;
      z-index: 80;
      background: color-mix(in srgb, var(--bg) 72%, transparent);
    }

    .panel {
      position: fixed;
      z-index: 81;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: min(760px, calc(100vw - 32px));
      max-height: calc(100vh - 32px);
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 18px;
      background: var(--panel);
      border: var(--bw) solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
    }

    h2 {
      margin: 0;
      font-family: var(--font-display);
      font-size: 17px;
      letter-spacing: var(--ls-display);
      color: var(--text);
    }

    header p {
      margin: 4px 0 0;
      font-size: 12px;
      color: var(--muted);
    }

    .body {
      display: flex;
      gap: 14px;
      align-items: flex-start;
    }

    .stage {
      position: relative;
      flex: 1;
      min-width: 0;
      display: grid;
      place-items: center;
      max-height: 46vh;
      overflow: hidden;
      border: var(--bw) solid var(--border);
      border-radius: var(--radius);
      background: repeating-linear-gradient(45deg, var(--panel2) 0 8px, var(--panel) 8px 16px);
      touch-action: none;
      cursor: crosshair;
    }

    .stage img {
      display: block;
      max-width: 100%;
      max-height: 46vh;
      user-select: none;
    }

    .target {
      position: absolute;
      width: 26px;
      height: 26px;
      margin: -13px 0 0 -13px;
      padding: 0;
      border-radius: var(--pill);
      border: 2px solid var(--accent-contrast);
      background: color-mix(in srgb, var(--accent) 55%, transparent);
      box-shadow: 0 0 0 2px var(--accent);
      cursor: grab;
    }

    .previews {
      width: 190px;
      flex: none;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .preview__label {
      font-family: var(--font-mono);
      font-size: 9px;
      letter-spacing: 0.13em;
      text-transform: uppercase;
      color: var(--muted);
    }

    .preview__frame {
      position: relative;
      width: 100%;
      margin-top: 3px;
      background-size: cover;
      border: var(--bw) solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
    }

    .preview__fade {
      position: absolute;
      inset: 0;
      background: linear-gradient(
        180deg,
        rgba(0, 0, 0, 0) 30%,
        color-mix(in srgb, var(--bg) 72%, transparent) 74%,
        var(--bg) 100%
      );
    }

    .preview__covered {
      position: absolute;
      inset: 55% 0 0;
      display: grid;
      place-items: center;
      font-family: var(--font-mono);
      font-size: 8px;
      letter-spacing: 0.08em;
      color: var(--muted);
      border-top: var(--bw) dashed var(--border);
    }

    footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
    }

    .coords {
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--muted);
    }

    .actions {
      display: flex;
      gap: 8px;
    }
  `,
})
export class UiImageFocus {
  protected readonly focus = inject(ImageFocusService);
  protected readonly surfaces = SURFACES;

  private readonly source = viewChild<ElementRef<HTMLImageElement>>('source');
  private readonly target = viewChild<ElementRef<HTMLButtonElement>>('target');

  private readonly point = signal<FocalPoint>({ x: 0.5, y: 0.5 });
  private dragging = false;

  protected readonly draft = this.point.asReadonly();
  protected readonly position = computed(() => focalToPosition(this.point()));
  protected readonly targetLabel = computed(() => {
    const { x, y } = this.point();
    return `Focal point ${Math.round(x * 100)}% across, ${Math.round(y * 100)}% down`;
  });

  constructor() {
    effect(() => {
      const open = this.focus.pending();
      if (!open) return;

      // Start from whatever the image already carries, so reopening the editor
      // shows the current framing rather than resetting it to the middle.
      this.point.set(this.focus.current() ?? { x: 0.5, y: 0.5 });

      // Focus the target itself: it is the control, and it puts a keyboard user
      // one Tab away from nothing — arrows work immediately.
      queueMicrotask(() => this.target()?.nativeElement.focus());
    });

    effect(onCleanup => {
      if (!this.focus.pending()) return;
      // The overlay scrolls internally; letting the page behind scroll too makes
      // dragging feel like the picture is slipping.
      const previous = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      onCleanup(() => {
        document.body.style.overflow = previous;
      });
    });
  }

  protected onPointerDown(event: PointerEvent): void {
    this.dragging = true;
    // Capture on the stage, so a drag that leaves the picture keeps tracking
    // instead of stopping dead at the edge (the util clamps the result).
    // Optional: capture throws on a pointer id the browser no longer considers
    // active, and losing the whole drag over that would be worse than tracking
    // only while the pointer stays inside.
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    this.moveTo(event);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.dragging) this.moveTo(event);
  }

  protected endDrag(event: PointerEvent): void {
    this.dragging = false;
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
  }

  /**
   * The keyboard half. Dragging alone is unusable without a pointer, so the
   * target is a real button and the arrows move it — same bargain `ui-reorder`
   * strikes for drag-to-reorder lists.
   */
  protected onKeydown(event: KeyboardEvent): void {
    const step = event.shiftKey ? COARSE_STEP : STEP;
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };

    if (event.key === 'Enter') {
      event.preventDefault();
      void this.save();
      return;
    }

    const delta = deltas[event.key];
    if (!delta) return;

    event.preventDefault();
    const current = this.point();
    this.point.set(clampFocal({ x: current.x + delta[0], y: current.y + delta[1] }));
  }

  protected save(): void {
    void this.focus.save(this.point());
  }

  protected reset(): void {
    void this.focus.reset();
  }

  protected cancel(): void {
    this.focus.close();
  }

  private moveTo(event: PointerEvent): void {
    const image = this.source()?.nativeElement;
    if (!image) return;
    // Measured against the picture, not the stage: the stage is letterboxed
    // around it, and a point in the letterbox is on no pixel of the image.
    this.point.set(focalFromPoint(event, image.getBoundingClientRect()));
  }
}
