import { Injectable, computed, inject, signal } from '@angular/core';

import { ImagesApi } from '../api/images-api';
import { FocalPoint, ImageUsage } from '../models';
import { focalToPosition } from '../utils/focal.util';
import { ToastService } from './toast.service';

/** What the editor overlay needs to render, or null when it is closed. */
export interface FramingRequest {
  imageId: string;
  url: string;
  /** Decides which surfaces the editor previews. */
  usage: ImageUsage;
}

/**
 * Owns image framing: the focal point of every image the tenant owns, plus the
 * open/closed state of the editor that sets it.
 *
 * The editor is rendered once by `ui-image-focus` in the shell — the same
 * service-drives-a-global-outlet arrangement as `ui-toast`. Pages therefore
 * never host the overlay; they call `uploadAndFrame` or `frame` and await the
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
  private settle: (() => void) | null = null;

  readonly pending = this.request.asReadonly();
  readonly current = computed(() => {
    const open = this.request();
    return open ? (this.focals().get(open.imageId) ?? null) : null;
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
   * Opens the editor for an existing image; resolves when it closes.
   * `usage` says what the image is for, so the editor previews only the
   * surfaces that will actually show it.
   */
  frame(imageId: string, usage: ImageUsage): Promise<void> {
    const url = this.images.url(imageId);
    if (!url) return Promise.resolve();

    // Two overlays at once would strand the first promise unresolved.
    this.close();
    this.request.set({ imageId, url, usage });
    return new Promise<void>(resolve => {
      this.settle = resolve;
    });
  }

  /**
   * Uploads a file and immediately offers to frame it, returning the new id.
   * The framing step is skippable: closing without choosing leaves the image
   * unframed and centred, which is exactly how it behaved before this existed.
   */
  async uploadAndFrame(file: File, usage: ImageUsage): Promise<string> {
    const id = await this.images.upload(file);
    await this.frame(id, usage);
    return id;
  }

  /** Persists the chosen point and closes the editor. */
  save(focal: FocalPoint): Promise<void> {
    return this.commit(focal);
  }

  /** Clears the framing back to centred and closes the editor. */
  reset(): Promise<void> {
    return this.commit(null);
  }

  /**
   * Applies the framing locally, closes, then writes it.
   *
   * Local first so every surface repaints on the same frame the overlay closes
   * — waiting on the network would make the editor feel like it hadn't taken.
   * The previous value is kept so a failed write can be rolled back: showing a
   * framing that isn't stored would come back "undone" on the next reload with
   * no explanation.
   */
  private async commit(focal: FocalPoint | null): Promise<void> {
    const open = this.request();
    if (!open) return;

    const previous = this.focals().get(open.imageId) ?? null;
    this.apply(open.imageId, focal);
    this.close();

    try {
      await this.images.setFocal(open.imageId, focal);
    } catch (err) {
      this.apply(open.imageId, previous);
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

  /** Closes without changing anything. */
  close(): void {
    this.request.set(null);
    this.settle?.();
    this.settle = null;
  }
}
