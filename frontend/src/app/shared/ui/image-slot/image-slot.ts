import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';

import { I18nService } from '../../../core/i18n';
import { TPipe } from '../../pipes/t.pipe';

/**
 * User-fillable image placeholder (collection banners and icons).
 * Purely presentational: shows `src` when set, the striped placeholder
 * otherwise, and emits the picked/dropped file — the page owns upload
 * and persistence.
 */
@Component({
  selector: 'ui-image-slot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe],
  host: {
    '(click)': 'browse()',
    '(dragover)': 'onDragOver($event)',
    '(drop)': 'onDrop($event)',
    // Bound, not literal: a host attribute is written once at creation, so the
    // title has to be an expression to follow a language change.
    '[title]': "i18n.t('ui.imageSlot.hint')",
  },
  template: `
    @if (src(); as url) {
      <div
        class="image"
        [style.background-image]="'url(' + url + ')'"
        [style.background-position]="focal()"
      ></div>
      @if (reframable()) {
        <button
          type="button"
          class="reframe"
          [title]="'ui.imageSlot.reframe' | t"
          [attr.aria-label]="'ui.imageSlot.reframe' | t"
          (click)="requestReframe($event)"
        >
          ⌖
        </button>
      }
    } @else {
      <div class="placeholder">
        <span>{{ placeholder() }}</span>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      cursor: pointer;
    }

    .reframe {
      position: absolute;
      top: 6px;
      right: 6px;
      width: 20px;
      height: 20px;
      display: grid;
      place-items: center;
      border: var(--bw) solid var(--border);
      border-radius: var(--pill);
      background: var(--panel);
      color: var(--text2);
      font-size: 11px;
      cursor: pointer;

      &:hover {
        color: var(--accent);
        border-color: var(--accent);
      }
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
  protected readonly i18n = inject(I18nService);

  readonly src = input<string | null>(null);
  /**
   * CSS `background-position` for the crop — the page resolves it from
   * `ImageFocusService`, keeping this component free of any state dependency.
   */
  readonly focal = input('50% 50%');
  /** Shows the "adjust framing" affordance. Off by default: read-only usages
   * (the dashboard card) must stay inert. */
  readonly reframable = input(false);
  readonly placeholder = input('');
  readonly fileSelected = output<File>();
  readonly reframeRequested = output<void>();

  protected requestReframe(event: MouseEvent): void {
    // The host opens the file picker on click; framing must not also replace
    // the image the user is trying to reframe.
    event.stopPropagation();
    this.reframeRequested.emit();
  }

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
