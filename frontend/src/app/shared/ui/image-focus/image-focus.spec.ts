import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { ImageUsage } from '../../../core/models';
import { ImageFocusService } from '../../../core/state/image-focus.service';
import { UiImageFocus } from './image-focus';

function mount() {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
  });

  const focus = TestBed.inject(ImageFocusService);
  const fixture = TestBed.createComponent(UiImageFocus);
  fixture.detectChanges();

  return {
    fixture,
    focus,
    open: (id = 'img-1', usage: ImageUsage = 'item') => {
      const closed = focus.frame(id, usage);
      fixture.detectChanges();
      return closed;
    },
    previewLabels: (): string[] =>
      [...fixture.nativeElement.querySelectorAll('.preview__label')].map((el: Element) =>
        (el.textContent ?? '').trim(),
      ),
    target: () => fixture.nativeElement.querySelector('.target') as HTMLButtonElement,
    press: (key: string, shiftKey = false) => {
      const el = fixture.nativeElement.querySelector('.target') as HTMLButtonElement;
      el.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }));
      fixture.detectChanges();
    },
  };
}

/** jsdom performs no layout, so the picture's box is stated explicitly. */
function stubBox(
  fixture: { nativeElement: HTMLElement },
  box: { left: number; top: number; width: number; height: number },
): void {
  const image = fixture.nativeElement.querySelector('.stage img') as HTMLElement;
  image.getBoundingClientRect = () => ({ ...box, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => '' });
}

function pointer(type: string, clientX: number, clientY: number): Event {
  // jsdom has no PointerEvent constructor; MouseEvent carries the same
  // coordinate fields the component reads.
  const event = new MouseEvent(type, { clientX, clientY, bubbles: true });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  return event;
}

/** Reads the focal back off the DOM, which is the only thing the user sees. */
function position(fixture: { nativeElement: HTMLElement }): { x: number; y: number } {
  const target = fixture.nativeElement.querySelector('.target') as HTMLButtonElement;
  return { x: parseFloat(target.style.left), y: parseFloat(target.style.top) };
}

describe('UiImageFocus', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('renders nothing until an image is being framed', () => {
    const { fixture } = mount();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
  });

  it('starts an unframed image in the middle', () => {
    const ui = mount();
    ui.open();

    expect(ui.target()).not.toBeNull();
    expect(position(ui.fixture)).toEqual({ x: 50, y: 50 });
  });

  it('moves the focal point with the arrow keys', () => {
    const ui = mount();
    ui.open();

    ui.press('ArrowRight');
    ui.press('ArrowDown');

    expect(position(ui.fixture)).toEqual({ x: 51, y: 51 });
  });

  it('takes bigger steps with Shift held', () => {
    const ui = mount();
    ui.open();

    ui.press('ArrowLeft', true);

    expect(position(ui.fixture).x).toBeCloseTo(40);
  });

  it('never walks the focal point off the picture', () => {
    const ui = mount();
    ui.open();

    for (let i = 0; i < 8; i++) ui.press('ArrowUp', true);

    expect(position(ui.fixture).y).toBe(0);
  });

  it('ignores keys that are not a direction', () => {
    const ui = mount();
    ui.open();

    ui.press('a');

    expect(position(ui.fixture)).toEqual({ x: 50, y: 50 });
  });

  it('resolves the caller when the editor closes, so an upload can continue', async () => {
    const ui = mount();
    const closed = ui.open();

    ui.focus.close();
    ui.fixture.detectChanges();

    // The upload flow awaits this; leaving it unresolved would hang the save.
    await expect(closed).resolves.toBeUndefined();
    expect(ui.fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
  });

  it('previews only the surfaces that will show an item photo', () => {
    const ui = mount();
    ui.open('img-1', 'item');

    // A collection banner never renders an item photo, so previewing one would
    // invent a constraint the user does not actually have to satisfy.
    expect(ui.previewLabels()).toEqual(['Item card', 'Item gallery']);
  });

  it('previews the banner surfaces, with the header overlap, for a banner', () => {
    const ui = mount();
    ui.open('img-1', 'banner');

    expect(ui.previewLabels()).toEqual(['Collection banner', 'Dashboard card']);
    // The page header hides the banner's bottom; the preview has to say so.
    expect(ui.fixture.nativeElement.querySelectorAll('.preview__covered').length).toBe(1);
  });

  it('previews just the square for a collection icon', () => {
    const ui = mount();
    ui.open('img-1', 'icon');

    expect(ui.previewLabels()).toEqual(['Collection icon']);
  });

  it('follows a pointer drag across the picture', () => {
    const ui = mount();
    ui.open();

    // jsdom does no layout, so the picture's box has to be stated for the
    // component to have anything to measure against.
    stubBox(ui.fixture, { left: 100, top: 50, width: 200, height: 100 });
    const stage = ui.fixture.nativeElement.querySelector('.stage') as HTMLElement;

    stage.dispatchEvent(pointer('pointerdown', 150, 75));
    stage.dispatchEvent(pointer('pointermove', 180, 90));
    ui.fixture.detectChanges();

    expect(position(ui.fixture)).toEqual({ x: 40, y: 40 });
  });

  it('ignores pointer movement that is not part of a drag', () => {
    const ui = mount();
    ui.open();
    stubBox(ui.fixture, { left: 100, top: 50, width: 200, height: 100 });
    const stage = ui.fixture.nativeElement.querySelector('.stage') as HTMLElement;

    // Merely hovering must not move the target out from under the user.
    stage.dispatchEvent(pointer('pointermove', 180, 90));
    ui.fixture.detectChanges();

    expect(position(ui.fixture)).toEqual({ x: 50, y: 50 });
  });

  it('stops tracking once the pointer is released', () => {
    const ui = mount();
    ui.open();
    stubBox(ui.fixture, { left: 100, top: 50, width: 200, height: 100 });
    const stage = ui.fixture.nativeElement.querySelector('.stage') as HTMLElement;

    stage.dispatchEvent(pointer('pointerdown', 150, 75));
    stage.dispatchEvent(pointer('pointerup', 150, 75));
    stage.dispatchEvent(pointer('pointermove', 300, 150));
    ui.fixture.detectChanges();

    expect(position(ui.fixture)).toEqual({ x: 25, y: 25 });
  });

  it('reopens an already-framed image where the user left it', () => {
    const ui = mount();
    ui.open('img-2');
    ui.press('ArrowRight', true);
    void ui.focus.save({ x: 0.6, y: 0.5 });
    ui.fixture.detectChanges();

    ui.open('img-2');

    expect(position(ui.fixture).x).toBeCloseTo(60);
  });
});
