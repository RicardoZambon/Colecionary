import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  MAX_UPLOAD_BYTES,
  PhotoUploadService,
} from '../../../core/state/photo-upload.service';
import { UiPhotoManager } from './photo-manager';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiPhotoManager],
  template: `
    <ui-photo-manager
      [photoIds]="ids()"
      [max]="3"
      (changed)="ids.set($event)"
      (framed)="framed.set($event)"
    />
  `,
})
class HostComponent {
  readonly ids = signal(['a', 'b', 'c']);
  readonly framed = signal<string | null>(null);
}

function mount() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, host: fixture.componentInstance, el };
}

/** The nth photo tile's action button whose visible text matches. */
function action(el: HTMLElement, index: number, text: string): HTMLButtonElement {
  const tile = el.querySelectorAll('.photo')[index];
  const match = [...tile.querySelectorAll('button')].find(
    b => b.textContent?.trim() === text || b.getAttribute('title') === text,
  );
  if (!match) throw new Error(`no "${text}" button on photo ${index}`);
  return match as HTMLButtonElement;
}

describe('UiPhotoManager', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('marks the first photo as the cover, and only the first', () => {
    const { el } = mount();
    const tiles = el.querySelectorAll('.photo');

    expect(tiles[0].classList).toContain('photo--cover');
    expect(tiles[1].classList).not.toContain('photo--cover');
    expect(el.querySelectorAll('.badge')).toHaveLength(1);
  });

  it('promotes any photo to cover — the defect that started this', () => {
    // The old flow made the first *uploaded* photo the cover with no way back.
    const { fixture, host, el } = mount();

    action(el, 2, 'Make cover').click();
    fixture.detectChanges();

    expect(host.ids()).toEqual(['c', 'a', 'b']);
  });

  it('offers no "make cover" on the photo that already is one', () => {
    const { el } = mount();
    const first = el.querySelectorAll('.photo')[0];

    expect([...first.querySelectorAll('button')].map(b => b.textContent?.trim()))
      .not.toContain('Make cover');
  });

  it('reorders with the keyboard controls', () => {
    const { fixture, host, el } = mount();

    // ui-reorder's second button moves the photo later.
    const down = el.querySelectorAll('.photo')[0].querySelectorAll('ui-reorder button')[1];
    (down as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(host.ids()).toEqual(['b', 'a', 'c']);
  });

  it('will not move the first photo earlier or the last one later', () => {
    const { el } = mount();
    const firstUp = el.querySelectorAll('.photo')[0].querySelectorAll('ui-reorder button')[0];
    const lastDown = el.querySelectorAll('.photo')[2].querySelectorAll('ui-reorder button')[1];

    // aria-disabled, not the disabled attribute: ui-reorder keeps a boundary
    // arrow focusable on purpose — the browser blows focus off an element the
    // moment it becomes disabled. See UiReorder.move.
    expect(firstUp.getAttribute('aria-disabled')).toBe('true');
    expect(lastDown.getAttribute('aria-disabled')).toBe('true');
  });

  it('removes a photo by position, not by id', () => {
    const { fixture, host, el } = mount();

    action(el, 1, 'Remove photo').click();
    fixture.detectChanges();

    expect(host.ids()).toEqual(['a', 'c']);
  });

  it('asks the page to frame a photo rather than framing it itself', () => {
    const { fixture, host, el } = mount();

    action(el, 1, 'Adjust framing').click();
    fixture.detectChanges();

    expect(host.framed()).toBe('b');
  });

  it('closes the dropzone once every slot is used', () => {
    const { el } = mount();
    const dropzone = el.querySelector('.dropzone') as HTMLButtonElement;

    expect(dropzone.disabled).toBe(true);
    expect(dropzone.textContent).toContain('3');
  });

  it('requests thumbnails, not full-size photos, for the tiles', () => {
    const { el } = mount();
    const tile = el.querySelector('.photo__image') as HTMLElement;

    // A ~104px tile pulling the original is the whole reported problem.
    expect(tile.style.backgroundImage).toContain('size=thumb');
  });
});

describe('UiPhotoManager — the queue belongs to the surface showing it', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('does not carry a failure row over to the next item it mounts on', () => {
    // `PhotoUploadService` is providedIn: 'root' with one shared queue, and
    // `clear()` — whose own comment says it is "called when a page that owns the
    // queue goes away" — had no caller anywhere. So a red "Larger than 5 MB" row
    // for one item's 12 MB photo sat above a *different* item's dropzone,
    // naming a file with nothing to do with it, for the rest of the session.
    const { fixture } = mount();
    const uploads = TestBed.inject(PhotoUploadService);

    // A rejection needs no server: the size check is local, which is the whole
    // reason the item page was routed through this service too.
    const tooBig = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], 'huge.jpg', {
      type: 'image/jpeg',
    });
    void uploads.add([tooBig], 3);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.upload--failed')).toHaveLength(1);

    fixture.destroy();
    expect(uploads.queue()).toHaveLength(0);

    const next = TestBed.createComponent(HostComponent);
    next.detectChanges();
    expect(next.nativeElement.querySelectorAll('.upload--failed')).toHaveLength(0);
  });
});
