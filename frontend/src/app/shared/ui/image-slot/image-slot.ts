import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';

import { I18nService } from '../../../core/i18n';
import { TPipe } from '../../pipes/t.pipe';
import { IconName, UiIcon } from '../icon/icon';

/**
 * User-fillable image placeholder (collection banners and icons).
 * Purely presentational: shows `src` when set, an empty-state placeholder
 * otherwise, and emits the picked/dropped file — the page owns upload and
 * persistence.
 *
 * **The placeholder says "empty", never "loading".** It used to be a diagonal
 * stripe hatch, which is the exact silhouette of a skeleton shimmer, so on the
 * dashboard, the store and the group grid the majority of cards read as
 * permanently mid-fetch — and because the app had no real skeletons, nothing
 * anywhere distinguished the two states. It is now a flat `--panel2` field with
 * a large, dimmed outline mark: static, obviously terminal, and unmistakable
 * next to `ui-skeleton`'s sweep. Stripes are reserved for nothing at all now;
 * `ui-skeleton` supersedes them.
 */
@Component({
  selector: 'ui-image-slot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe, UiIcon],
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
          <ui-icon name="crosshair" [size]="13" />
        </button>
      }
    } @else {
      <div class="placeholder">
        <ui-icon class="placeholder__mark" [name]="icon()" [size]="34" [strokeWidth]="1.5" />
        @if (placeholder()) {
          <span>{{ placeholder() }}</span>
        }
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
      top: var(--sp-2);
      right: var(--sp-2);
      width: 22px;
      height: 22px;
      display: grid;
      place-items: center;
      padding: 0;
      border: var(--bw) solid var(--border);
      border-radius: var(--pill);
      background: var(--panel);
      color: var(--text2);
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

    /* Flat and still. See the class comment: anything with a repeating pattern
       here reads as a shimmer. */
    .placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--sp-1);
      padding: var(--sp-2);
      background: var(--panel2);

      &__mark {
        color: var(--muted-strong);
        /* Dimmed because the mark is decoration and the label is the message;
           the label itself stays at full strength and clears AA. */
        opacity: 0.4;
      }

      span {
        font-family: var(--font-mono);
        font-size: var(--fs-xs);
        letter-spacing: 0.08em;
        color: var(--muted-strong);
        text-align: center;
        /* A banner slot can be 150px tall and 40px on a phone; the label goes
           before the mark does. */
        overflow: hidden;
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
  /** The mark drawn behind the placeholder label. */
  readonly icon = input<IconName>('image');
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
