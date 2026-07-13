import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * User-fillable image placeholder (collection banners and icons).
 * Purely presentational: shows `src` when set, the striped placeholder
 * otherwise, and emits the picked/dropped file — the page owns upload
 * and persistence.
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
  readonly src = input<string | null>(null);
  readonly placeholder = input('');
  readonly fileSelected = output<File>();

  protected browse(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) this.fileSelected.emit(file);
    };
    input.click();
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) this.fileSelected.emit(file);
  }
}
