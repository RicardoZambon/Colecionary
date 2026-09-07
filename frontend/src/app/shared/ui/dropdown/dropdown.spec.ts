import { Component, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { UiDropdown } from './dropdown';

/**
 * The keyboard model. None of it existed: Escape did nothing, arrows did
 * nothing, and choosing an option destroyed the trigger, so focus fell to
 * `<body>` and the next Tab restarted at the skip link.
 */
@Component({
  imports: [UiDropdown],
  template: `
    <ui-dropdown>
      <button ddTrigger type="button" id="trigger">Theme</button>
      <ng-container ddPanel>
        <button type="button" id="paper">Paperwhite</button>
        <button type="button" id="synth">Synthwave</button>
        <button type="button" id="term">Terminal</button>
      </ng-container>
    </ui-dropdown>
  `,
})
class Host {
  readonly menu = viewChild.required(UiDropdown);
}

describe('UiDropdown', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<Host>>;
  let el: HTMLElement;

  function trigger() {
    return el.querySelector('#trigger') as HTMLButtonElement;
  }

  function key(name: string, target: Element | null = document.activeElement) {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
    (target ?? el).dispatchEvent(event);
    fixture.detectChanges();
    return event;
  }

  function openWithKeyboard() {
    trigger().focus();
    // detail 0 is what the browser sends for Enter or Space on a button.
    trigger().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    fixture = TestBed.createComponent(Host);
    el = fixture.nativeElement as HTMLElement;
    document.body.appendChild(el);
    fixture.detectChanges();
  });

  it('names the panel it controls, so a trigger can say what it opens', () => {
    expect(fixture.componentInstance.menu().panelId).toMatch(/^dd-\d+$/);
    openWithKeyboard();
    expect(el.querySelector('.panel')?.id).toBe(fixture.componentInstance.menu().panelId);
  });

  it('steps into the panel when a key opened it, and not when a click did', () => {
    openWithKeyboard();
    expect(document.activeElement).toBe(el.querySelector('#paper'));

    fixture.componentInstance.menu().close();
    fixture.detectChanges();
    trigger().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    fixture.detectChanges();
    expect(document.activeElement).toBe(trigger());
  });

  it('opens on ArrowDown from a closed trigger', () => {
    trigger().focus();
    key('ArrowDown', trigger());
    expect(fixture.componentInstance.menu().open()).toBe(true);
    expect(document.activeElement).toBe(el.querySelector('#paper'));
  });

  it('moves between items with the arrows, wrapping at both ends', () => {
    openWithKeyboard();
    key('ArrowDown');
    expect(document.activeElement).toBe(el.querySelector('#synth'));
    key('ArrowUp');
    key('ArrowUp');
    expect(document.activeElement).toBe(el.querySelector('#term'));
  });

  it('jumps to the ends with Home and End', () => {
    openWithKeyboard();
    key('End');
    expect(document.activeElement).toBe(el.querySelector('#term'));
    key('Home');
    expect(document.activeElement).toBe(el.querySelector('#paper'));
  });

  it('type-ahead reaches an option by its first letter', () => {
    openWithKeyboard();
    key('s');
    expect(document.activeElement).toBe(el.querySelector('#synth'));
  });

  it('closes on Escape and hands focus back to the trigger', () => {
    openWithKeyboard();

    const event = key('Escape');

    expect(event.defaultPrevented).toBe(true);
    expect(fixture.componentInstance.menu().open()).toBe(false);
    expect(document.activeElement).toBe(trigger());
  });

  it('returns focus to the trigger whenever it closes, however that happened', () => {
    openWithKeyboard();

    fixture.componentInstance.menu().close();
    fixture.detectChanges();

    expect(document.activeElement).toBe(trigger());
  });
});
