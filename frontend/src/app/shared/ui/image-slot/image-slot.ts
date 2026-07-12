import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { ImageSlotService } from '../../../core/state/image-slot.service';

/**
 * User-fillable image placeholder (collection banners and icons).
 * Click to browse or drop an image file; the image persists per slot id.
 */
@Component({
  selector: 'ui-image-slot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(click)': 'browse()',
    '(dragover)': 'onDragOver($event)',
    '(drop)': 'onDrop($event)',
    title: 'Click or drop an image',
  },
  template: `
    @if (src(); as url) {
      <div class="image" [style.background-image]="'url(' + url + ')'"></div>
    } @else {
      <div class="placeholder">
        <span>{{ placeholder() }}</span>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
      overflow: hidden;
      cursor: pointer;
    }

    .image {
      width: 100%;
      height: 100%;
      background-size: cover;
      background-position: center;
    }

    .placeholder {
      width: 100%;
      height: 100%;
      display: grid;
      place-items: center;
      background: repeating-linear-gradient(45deg, var(--panel2) 0 8px, var(--panel) 8px 16px);

      span {
        font-family: var(--font-mono);
        font-size: 10px;
        color: var(--muted);
        padding: 6px 10px;
        text-align: center;
      }
    }
  `,
})
export class UiImageSlot {
  private readonly imageSlots = inject(ImageSlotService);

  readonly slotId = input.required<string>();
  readonly placeholder = input('');

  protected readonly src = computed(() => this.imageSlots.images()[this.slotId()]);

  protected browse(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void this.imageSlots.setImage(this.slotId(), file);
    };
    input.click();
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) void this.imageSlots.setImage(this.slotId(), file);
  }
}
