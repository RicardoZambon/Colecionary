import { Injectable, computed, inject, signal } from '@angular/core';

import { ImagesApi } from '../api/images-api';
import { I18nService } from '../i18n/i18n.service';

/** Mirrors `ImageService.MaxBytes` on the server. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** One file's journey, from picked to stored. */
export interface PhotoUpload {
  /** Local to this queue — the server id only exists once it succeeds. */
  key: string;
  name: string;
  /** 0–1 while uploading. */
  progress: number;
  status: 'uploading' | 'done' | 'failed';
  /** Already translated, ready to render. */
  error?: string;
  imageId?: string;
}

/**
 * Uploads picked photos and reports how each one is going.
 *
 * Deliberately **not** part of framing. Uploading used to run through the
 * framing editor, which made "click outside the modal" mean "throw the file
 * away" and made the first file of every batch the only one you could frame.
 * Splitting them is what fixes both: bytes go up as soon as they are picked, and
 * framing becomes something you choose to do to a photo that already exists.
 *
 * One shared queue rather than one per page, for the same reason `ToastService`
 * is shared: only one upload surface is ever on screen, and a global outlet is
 * how this app already renders transient state.
 */
@Injectable({ providedIn: 'root' })
export class PhotoUploadService {
  private readonly images = inject(ImagesApi);
  private readonly i18n = inject(I18nService);

  private readonly items = signal<PhotoUpload[]>([]);
  private sequence = 0;

  readonly queue = this.items.asReadonly();

  /** True while anything is still in flight — pages disable Save on it. */
  readonly busy = computed(() => this.items().some(u => u.status === 'uploading'));

  /** Failures still on screen, which the user has not dismissed. */
  readonly failures = computed(() => this.items().filter(u => u.status === 'failed'));

  /**
   * Uploads every acceptable file and resolves with the ids that made it.
   *
   * Sequential, not parallel: a batch of phone photos is tens of megabytes, and
   * saturating the connection would make every individual bar crawl while the
   * whole batch finished no sooner. In order, so the ids come back in the order
   * the user picked them — which is the order they will appear in the gallery.
   *
   * One file failing never stops the rest. The others were picked deliberately
   * too, and a half-finished batch that reports what broke beats one that
   * abandons six photos because the third was a PDF.
   */
  async add(files: readonly File[], remaining: number): Promise<string[]> {
    const accepted: File[] = [];

    for (const file of files) {
      if (accepted.length >= remaining) {
        this.reject(file, this.i18n.t('upload.error.tooMany'));
        continue;
      }
      if (!file.type.startsWith('image/')) {
        this.reject(file, this.i18n.t('upload.error.notAnImage'));
        continue;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        this.reject(file, this.i18n.t('upload.error.tooLarge'));
        continue;
      }
      accepted.push(file);
    }

    const ids: string[] = [];
    for (const file of accepted) {
      const key = this.enqueue(file);
      try {
        const imageId = await this.images.uploadWithProgress(file, fraction =>
          this.patch(key, { progress: fraction }),
        );
        this.patch(key, { status: 'done', progress: 1, imageId });
        ids.push(imageId);
        // A success needs no dismissing: the photo itself appears in the grid,
        // which is better confirmation than a row saying it did.
        this.forget(key);
      } catch (err) {
        this.patch(key, {
          status: 'failed',
          error: err instanceof Error ? err.message : this.i18n.t('upload.error.failed'),
        });
      }
    }

    return ids;
  }

  /** Removes one row the user has read. */
  dismiss(key: string): void {
    this.forget(key);
  }

  /** Drops everything — called when a page that owns the queue goes away. */
  clear(): void {
    this.items.set([]);
  }

  private reject(file: File, error: string): void {
    this.items.update(all => [
      ...all,
      { key: this.nextKey(), name: file.name, progress: 0, status: 'failed', error },
    ]);
  }

  private enqueue(file: File): string {
    const key = this.nextKey();
    this.items.update(all => [
      ...all,
      { key, name: file.name, progress: 0, status: 'uploading' },
    ]);
    return key;
  }

  private nextKey(): string {
    return `u${++this.sequence}`;
  }

  private patch(key: string, patch: Partial<PhotoUpload>): void {
    this.items.update(all => all.map(u => (u.key === key ? { ...u, ...patch } : u)));
  }

  private forget(key: string): void {
    this.items.update(all => all.filter(u => u.key !== key));
  }
}
