import { Injectable, computed, inject, signal } from '@angular/core';

import { ImagesApi } from '../api/images-api';
import { FocalPoint, ImageUsage } from '../models';
import { focalToPosition } from '../utils/focal.util';
import { ToastService } from './toast.service';
import { I18nService } from '../i18n/i18n.service';

/** What the editor overlay needs to render, or null when it is closed. */
export interface FramingRequest {
  /**
   * Always a stored image. Framing used to run against files that were not
   * uploaded yet, which is what made closing the overlay destroy the upload;
   * now the bytes are always safe before this opens.
   */
  imageId: string;
  url: string;
  /** Decides which surfaces the editor previews. */
  usage: ImageUsage;
}

/**
 * How the editor closed.
 *
 * `cancelled` and `applied` with a null focal stay different: the first means
 * "leave the framing as it was", the second "centre it". Since the image is
 * always already stored, neither can lose a picture — which is what makes
 * closing the overlay by clicking the scrim safe.
 */
export type FramingResult =
  | { status: 'applied'; focal: FocalPoint | null }
  | { status: 'cancelled' };

/**
 * Owns image framing: the focal point of every image the tenant owns, plus the
 * open/closed state of the editor that sets it.
 *
 * The editor is rendered once by `ui-image-focus` in the shell — the same
 * service-drives-a-global-outlet arrangement as `ui-toast`. Pages therefore
 * never host the overlay; they call `uploadAndFrame` or `frame` and act on the
 * result.
 */
@Injectable({ providedIn: 'root' })
export class ImageFocusService {
  private readonly images = inject(ImagesApi);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  /** id → focal. Absent means unframed, which renders centred. */
  private readonly focals = signal(new Map<string, FocalPoint>());
  private readonly request = signal<FramingRequest | null>(null);

  /** Resolves the promise handed back by `frame`, once the user is done. */
  private settle: ((result: FramingResult) => void) | null = null;

  readonly pending = this.request.asReadonly();

  readonly current = computed(() => {
    const id = this.request()?.imageId;
    return id ? (this.focals().get(id) ?? null) : null;
  });

  /**
   * Loads every focal point in one request. Called once at startup, alongside
   * the collection graph — the app already loads its whole catalogue up front,
   * and framing is a few bytes per image next to that.
   */
  async load(): Promise<void> {
    const metas = await this.images.listMeta();
    const map = new Map<string, FocalPoint>();
    for (const meta of metas) {
      if (meta.focal) map.set(meta.id, meta.focal);
    }
    this.focals.set(map);
  }

  /** The CSS `background-position` an image should render with. */
  position(id: string | null | undefined): string {
    return focalToPosition(id ? this.focals().get(id) : null);
  }

  /**
   * Opens the editor for an image that already exists, persisting the choice.
   * `usage` says what the image is for, so the editor previews only the
   * surfaces that will actually show it.
   */
  frame(imageId: string, usage: ImageUsage): Promise<FramingResult> {
    // `display` and not `full`: the stage is a few hundred pixels tall, so the
    // original would be megabytes downloaded to be drawn small — the very thing
    // this release set out to stop.
    const url = this.images.url(imageId, 'display');
    if (!url) return Promise.resolve({ status: 'cancelled' });
    return this.open({ imageId, url, usage });
  }

  /** Keeps the chosen point and closes the editor. */
  save(focal: FocalPoint): Promise<void> {
    return this.commit(focal);
  }

  /** Keeps the image but centred, and closes the editor. */
  reset(): Promise<void> {
    return this.commit(null);
  }

  /** Closes without applying anything — the caller undoes what it started. */
  close(): void {
    this.finish({ status: 'cancelled' });
  }

  private open(request: FramingRequest): Promise<FramingResult> {
    // Two overlays at once would strand the first promise unresolved.
    this.close();
    this.request.set(request);
    return new Promise<FramingResult>(resolve => {
      this.settle = resolve;
    });
  }

  /**
   * Applies the framing locally, closes, then writes it.
   *
   * Local first so every surface repaints on the same frame the overlay closes
   * — waiting on the network would make the editor feel like it hadn't taken.
   * The previous value is kept so a failed write can be rolled back: showing a
   * framing that isn't stored would come back "undone" on the next reload with
   * no explanation.
   *
   */
  private async commit(focal: FocalPoint | null): Promise<void> {
    const open = this.request();
    if (!open) return;

    const { imageId } = open;
    const previous = this.focals().get(imageId) ?? null;
    this.apply(imageId, focal);
    this.finish({ status: 'applied', focal });

    try {
      await this.images.setFocal(imageId, focal);
    } catch (err) {
      this.apply(imageId, previous);
      this.toast.flash(
        err instanceof Error ? err.message : this.i18n.t('toast.framing.failed'),
      );
    }
  }

  private apply(imageId: string, focal: FocalPoint | null): void {
    this.focals.update(map => {
      const next = new Map(map);
      if (focal) {
        next.set(imageId, focal);
      } else {
        next.delete(imageId);
      }
      return next;
    });
  }

  private finish(result: FramingResult): void {
    this.request.set(null);
    const settle = this.settle;
    this.settle = null;
    settle?.(result);
  }
}
