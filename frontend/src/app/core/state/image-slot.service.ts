import { Injectable, inject, signal } from '@angular/core';

import { ToastService } from './toast.service';

const STORAGE_KEY = 'vault.images';
const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.85;

/**
 * Stores user-dropped images for image slots (collection banners/icons),
 * keyed by slot id. Images are downscaled and kept as data URLs in
 * localStorage. In a real backend these would become asset uploads —
 * swap the internals, keep the signal API.
 */
@Injectable({ providedIn: 'root' })
export class ImageSlotService {
  private readonly toast = inject(ToastService);
  private readonly imagesState = signal<Record<string, string>>(this.restore());

  readonly images = this.imagesState.asReadonly();

  imageFor(slotId: string): string | undefined {
    return this.images()[slotId];
  }

  async setImage(slotId: string, file: File): Promise<void> {
    if (!file.type.startsWith('image/')) return;
    const dataUrl = await downscale(file);
    this.imagesState.update(all => ({ ...all, [slotId]: dataUrl }));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.imagesState()));
    } catch {
      this.toast.flash('Image kept for this session only (storage full)');
    }
  }

  private restore(): Record<string, string> {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    } catch {
      return {};
    }
  }
}

function downscale(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Not a decodable image'));
      img.onload = () => {
        const scale = Math.min(1, MAX_EDGE_PX / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
