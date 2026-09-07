import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { UiDialog } from './dialog';

/**
 * The modal contract, which regressed silently because none of it is visible
 * in a screenshot: a keyboard user could tab straight through the scrim onto
 * the page behind, the page behind scrolled under the wheel, and answering a
 * dialog left focus on `<body>` — so the next Tab restarted at the skip link.
 */
@Component({
  imports: [UiDialog],
  template: `
    <button type="button" id="opener" (click)="open.set(true)">Open</button>
    <button type="button" id="behind">Behind</button>
    @if (open()) {
      <ui-dialog [title]="'Delete 12 items'" (dismissed)="dismissed = dismissed + 1; open.set(false)">
        <p>Body</p>
        <ng-container dlgActions>
          <button type="button" id="cancel">Cancel</button>
          <button type="button" id="confirm">Delete</button>
        </ng-container>
      </ui-dialog>
    }
  `,
})
class Host {
  readonly open = signal(false);
  dismissed = 0;
}

describe('UiDialog', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<Host>>;
  let el: HTMLElement;

  function opener() {
    return el.querySelector('#opener') as HTMLButtonElement;
  }

  function open() {
    opener().focus();
    opener().click();
    fixture.detectChanges();
  }

  function tab(shift = false) {
    // cancelable, or preventDefault() is a no-op and defaultPrevented lies.
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: shift,
      bubbles: true,
      cancelable: true,
    });
    (document.activeElement ?? el).dispatchEvent(event);
    return event;
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    fixture = TestBed.createComponent(Host);
    el = fixture.nativeElement as HTMLElement;
    document.body.appendChild(el);
    fixture.detectChanges();
  });

  it('moves focus to the panel and not to a control, so a held Enter cannot answer it', () => {
    open();
    expect(document.activeElement).toBe(el.querySelector('.panel'));
  });

  it('locks the page behind it, and unlocks it again on close', () => {
    open();
    expect(document.body.style.overflow).toBe('hidden');

    fixture.componentInstance.open.set(false);
    fixture.detectChanges();

    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('gives focus back to whatever opened it', () => {
    open();
    fixture.componentInstance.open.set(false);
    fixture.detectChanges();

    expect(document.activeElement).toBe(opener());
  });

  it('lands on the main landmark when the opener was destroyed with the answer', () => {
    // The deleted-row case: the ✕ that opened the dialog belongs to the thing
    // the dialog removed, so there is no opener left. Declining to focus a
    // detached element was right and was only half of it — the other half left
    // focus on <body>, which is the state the restore exists to avoid.
    const main = document.createElement('main');
    main.id = 'main-content';
    main.tabIndex = -1;
    document.body.appendChild(main);
    open();
    const gone = opener();
    gone.remove();

    fixture.componentInstance.open.set(false);
    fixture.detectChanges();

    expect(document.activeElement).toBe(main);
    main.remove();
  });

  it('answers Escape even when focus never reached it', () => {
    open();
    (el.querySelector('#behind') as HTMLElement).focus();

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    fixture.detectChanges();

    expect(fixture.componentInstance.dismissed).toBe(1);
  });

  it('wraps Tab from the last control back to the first instead of leaving the modal', () => {
    open();
    (el.querySelector('#confirm') as HTMLElement).focus();

    const event = tab();

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(el.querySelector('#cancel'));
  });

  it('wraps Shift+Tab from the panel to the last control', () => {
    open();

    const event = tab(true);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(el.querySelector('#confirm'));
  });
});
