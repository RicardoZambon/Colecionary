import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import { ImagesApi } from '../../../core/api/images-api';
import { I18nService } from '../../../core/i18n';
import { ImageUsage } from '../../../core/models';
import { ImageFocusService } from '../../../core/state/image-focus.service';
import { PhotoUploadService } from '../../../core/state/photo-upload.service';
import { TPipe } from '../../pipes/t.pipe';
import { UiProgress } from '../progress/progress';
import { UiReorder } from '../reorder/reorder';

/**
 * The photo half of an item: add, order, choose the cover, frame, remove.
 *
 * Replaces a flow where uploading and framing were the same act. That
 * conflation caused every reported defect — a modal on every upload, a click
 * outside it destroying the file, and only ever being able to frame (and
 * therefore choose) the first photo of a batch. Here uploading is unattended and
 * curation happens afterwards, on photos that are already safe.
 *
 * **The cover is the first photo**, and reordering is how you change it. No
 * `coverId` field: a second source of truth can point at a removed photo and
 * would have to be defended in the validator, the importer and the archive
 * format, all to say something the order already says. "Make cover" is exactly
 * "move to the front", under the name a user recognises.
 */
@Component({
  selector: 'ui-photo-manager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe, UiProgress, UiReorder],
  template: `
    <button
      type="button"
      class="dropzone"
      [class.dropzone--full]="full()"
      [disabled]="full()"
      (click)="browse()"
      (dragover)="$event.preventDefault()"
      (drop)="onDrop($event)"
    >
      @if (full()) {
        {{ 'photos.full' | t: { max: max() } }}
      } @else {
        {{ 'photos.drop' | t }}<br />{{ 'photos.browse' | t: { remaining: remaining() } }}
      }
    </button>

    @for (upload of uploads.queue(); track upload.key) {
      <div class="upload" [class.upload--failed]="upload.status === 'failed'">
        <span class="upload__name">{{ upload.name }}</span>
        @if (upload.status === 'failed') {
          <span class="upload__error">{{ upload.error }}</span>
          <button
            type="button"
            class="upload__dismiss"
            [attr.aria-label]="'photos.dismiss' | t"
            (click)="uploads.dismiss(upload.key)"
          >✕</button>
        } @else {
          <ui-progress
            class="upload__bar"
            size="sm"
            [pct]="upload.progress * 100"
            [label]="i18n.t('photos.uploading', { name: upload.name })"
          />
        }
      </div>
    }

    @if (photoIds().length) {
      <ul class="grid">
        @for (id of photoIds(); track id) {
          <li class="photo" [class.photo--cover]="$index === 0">
            <span
              class="photo__image"
              role="img"
              [attr.aria-label]="'photos.photoAt' | t: { n: $index + 1 }"
              [style.background-image]="'url(' + thumbUrl(id) + ')'"
              [style.background-position]="focus.position(id)"
            ></span>

            <ui-reorder
              [label]="i18n.t('photos.photoAt', { n: $index + 1 })"
              [first]="$index === 0"
              [last]="$index === photoIds().length - 1"
              (moved)="move($index, $event)"
            />

            @if ($index === 0) {
              <span class="badge">{{ 'photos.cover' | t }}</span>
            }

            <span class="photo__actions">
              @if ($index !== 0) {
                <button type="button" [title]="'photos.makeCover' | t" (click)="makeCover($index)">
                  {{ 'photos.makeCover' | t }}
                </button>
              }
              <button type="button" [title]="'photos.frame' | t" (click)="framed.emit(id)">⌖</button>
              <button
                type="button"
                class="danger"
                [title]="'photos.remove' | t"
                [attr.aria-label]="'photos.remove' | t"
                (click)="remove($index)"
              >✕</button>
            </span>
          </li>
        }
      </ul>

      <p class="hint">{{ 'photos.coverHint' | t }}</p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .dropzone {
      padding: 22px 12px;
      font-family: var(--font-mono);
      font-size: 11px;
      line-height: 1.7;
      color: var(--muted);
      text-align: center;
      cursor: pointer;
      background: repeating-linear-gradient(45deg, var(--panel2) 0 8px, var(--panel) 8px 16px);
      border: var(--bw) dashed var(--border);
      border-radius: var(--radius);

      &:hover:not(:disabled) {
        border-color: var(--accent);
        color: var(--text2);
      }

      &--full {
        cursor: default;
      }
    }

    .upload {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 9px;
      font-size: 11px;
      color: var(--text2);
      background: var(--panel2);
      border: var(--bw) solid var(--border);
      border-radius: var(--radius);

      &--failed {
        border-color: var(--danger, var(--border));
      }
    }

    .upload__name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .upload__error {
      color: var(--danger, var(--text2));
    }

    .upload__dismiss {
      border: 0;
      background: none;
      color: var(--muted);
      cursor: pointer;
    }

    .upload__bar {
      display: block;
      width: 92px;
      flex: none;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .photo {
      position: relative;
      aspect-ratio: 1;
      border: var(--bw) solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;

      &--cover {
        border-color: var(--accent);
      }
    }

    .photo__image {
      display: block;
      width: 100%;
      height: 100%;
      background-size: cover;
    }

    .badge {
      position: absolute;
      left: 6px;
      bottom: 6px;
      padding: 2px 7px;
      font-family: var(--font-mono);
      font-size: 8px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--accent-contrast);
      background: var(--accent);
      border-radius: var(--pill);
    }

    .photo__actions {
      position: absolute;
      inset: auto 0 0;
      display: flex;
      justify-content: flex-end;
      gap: 4px;
      padding: 6px;
      opacity: 0;
      transition: opacity 120ms ease;

      button {
        padding: 2px 6px;
        font-family: var(--font-mono);
        font-size: 9px;
        color: var(--text2);
        background: var(--panel);
        border: var(--bw) solid var(--border);
        border-radius: var(--pill);
        cursor: pointer;

        &:hover {
          color: var(--accent);
          border-color: var(--accent);
        }

        &.danger:hover {
          color: var(--danger, var(--accent));
          border-color: var(--danger, var(--accent));
        }
      }
    }

    /* Revealed on hover, but never hidden from a keyboard: :focus-within keeps
       the whole row reachable by Tab, which opacity:0 alone would strand. */
    .photo:hover .photo__actions,
    .photo:focus-within .photo__actions {
      opacity: 1;
    }
  `,
})
export class UiPhotoManager {
  protected readonly focus = inject(ImageFocusService);
  protected readonly uploads = inject(PhotoUploadService);
  protected readonly i18n = inject(I18nService);
  private readonly images = inject(ImagesApi);

  readonly photoIds = input.required<readonly string[]>();
  readonly max = input(8);
  /** Decides which surfaces the framing editor previews. */
  readonly usage = input<ImageUsage>('item');

  /** The whole list, after any edit. The page persists it. */
  readonly changed = output<string[]>();
  /** A photo the user wants to frame; the page opens the editor. */
  readonly framed = output<string>();

  protected readonly remaining = computed(() => Math.max(0, this.max() - this.photoIds().length));
  protected readonly full = computed(() => this.remaining() === 0);

  /** Tiles are ~104px, so a thumbnail is the right rendition by a wide margin. */
  protected thumbUrl(id: string): string | null {
    return this.images.url(id, 'thumb');
  }

  protected browse(): void {
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'image/*';
    picker.multiple = true;
    picker.onchange = () => void this.accept([...(picker.files ?? [])]);
    picker.click();
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    void this.accept([...(event.dataTransfer?.files ?? [])]);
  }

  /**
   * Appends whatever uploaded. Read from `photoIds()` *after* awaiting, never
   * from a value captured before: an upload takes seconds, and the user can
   * reorder or remove photos while it runs.
   */
  private async accept(files: File[]): Promise<void> {
    if (!files.length) return;
    const ids = await this.uploads.add(files, this.remaining());
    if (ids.length) this.changed.emit([...this.photoIds(), ...ids]);
  }

  protected move(index: number, delta: -1 | 1): void {
    const next = [...this.photoIds()];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    this.changed.emit(next);
  }

  /** "Move to the front" — the cover is position 0, so this is all it can be. */
  protected makeCover(index: number): void {
    const next = [...this.photoIds()];
    const [picked] = next.splice(index, 1);
    this.changed.emit([picked, ...next]);
  }

  protected remove(index: number): void {
    this.changed.emit(this.photoIds().filter((_, i) => i !== index));
  }
}
