import { Injectable, computed, inject, signal } from '@angular/core';

import { ImagesApi } from '../api/images-api';
import { FocalPoint, ImageUsage } from '../models';
import { focalToPosition } from '../utils/focal.util';
import { ToastService } from './toast.service';

/** What the editor overlay needs to render, or null when it is closed. */
export interface FramingRequest {
  /**
   * Null while framing a file that has not been uploaded yet — the editor is
   * shown before the upload so cancelling costs nothing.
   */
  imageId: string | null;
  url: string;
  /** Decides which surfaces the editor previews. */
  usage: ImageUsage;
  /** The url is a local object url and must be released when the editor closes. */
  local: boolean;
}

/**
 * How the editor closed.
 *
 * `cancelled` and `applied` with a null focal are deliberately different: the
 * first means "undo what I started", the second "keep it, centred". Collapsing
 * them is what made cancelling an upload still replace the picture.
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

  /** id → focal. Absent means unframed, which renders centred. */
  private readonly focals = signal(new Map<string, FocalPoint>());
  private readonly request = signal<FramingRequest | null>(null);

  /** Resolves the promise handed back by `frame`, once the user is done. */
  private settle: ((result: FramingResult) => void) | null = null;

  readonly pending = this.request.asReadonly();

  /** True while framing a picture that is not saved anywhere yet. */
  readonly isNew = computed(() => this.request()?.imageId === null);

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
    const url = this.images.url(imageId);
    if (!url) return Promise.resolve({ status: 'cancelled' });
    return this.open({ imageId, url, usage, local: false });
  }

  /**
   * Frames a picked file and uploads it only if the user goes through with it,
   * returning the new image id — or null if they cancelled.
   *
   * The editor runs against a local object url, so the bytes never reach the
   * server unless the user commits. That matters because there is no delete
   * endpoint: uploading first would leave an unreferenced file behind every
   * time someone changed their mind.
   */
  async uploadAndFrame(file: File, usage: ImageUsage): Promise<string | null> {
    const url = URL.createObjectURL(file);
    const result = await this.open({ imageId: null, url, usage, local: true });
    if (result.status === 'cancelled') return null;

    const id = await this.images.upload(file);
    if (result.focal) {
      this.apply(id, result.focal);
      // The image is already in place; a failed framing write is worth a toast
      // but must not fail the upload the caller is about to persist.
      try {
        await this.images.setFocal(id, result.focal);
      } catch {
        this.apply(id, null);
        this.toast.flash('Image saved, but its framing could not be stored');
      }
    }
    return id;
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
   * A picture that isn't uploaded yet has nothing to write to; its focal point
   * travels back to `uploadAndFrame` in the result instead.
   */
  private async commit(focal: FocalPoint | null): Promise<void> {
    const open = this.request();
    if (!open) return;

    const { imageId } = open;
    const previous = imageId ? (this.focals().get(imageId) ?? null) : null;
    if (imageId) this.apply(imageId, focal);
    this.finish({ status: 'applied', focal });

    if (!imageId) return;

    try {
      await this.images.setFocal(imageId, focal);
    } catch (err) {
      this.apply(imageId, previous);
      this.toast.flash(err instanceof Error ? err.message : 'Could not save framing');
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
    const open = this.request();
    if (open?.local) URL.revokeObjectURL(open.url);

    this.request.set(null);
    const settle = this.settle;
    this.settle = null;
    settle?.(result);
  }
}
