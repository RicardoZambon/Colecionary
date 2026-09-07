import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { UiInlineEdit } from './inline-edit';

/**
 * The four hand-rolled copies of this pattern each got a different part wrong;
 * the one that matters most is the first assertion here.
 */
@Component({
  imports: [UiInlineEdit],
  template: `
    <!-- A real opener, because where focus goes when the box closes is the
         property under test and it has to have come from somewhere. -->
    <button type="button" (click)="open.set(true)">+ Sub</button>
    <div (keydown)="bubbled = bubbled + 1">
    @if (open()) {
      <ui-inline-edit
        [value]="value()"
        [ariaLabel]="'New subgroup'"
        [commitOnBlur]="commitOnBlur()"
        (committed)="committed.push($event)"
        (cancelled)="cancelled = cancelled + 1"
      />
    }
    </div>
  `,
})
class Host {
  readonly open = signal(true);

  readonly value = signal('');
  readonly commitOnBlur = signal(true);
  readonly committed: string[] = [];
  cancelled = 0;
  bubbled = 0;
}

describe('UiInlineEdit', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<Host>>;
  let el: HTMLElement;

  function input() {
    return el.querySelector('input') as HTMLInputElement;
  }

  function type(text: string) {
    input().value = text;
    input().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function key(name: string) {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
    input().dispatchEvent(event);
    fixture.detectChanges();
    return event;
  }

  async function render(value = '') {
    fixture = TestBed.createComponent(Host);
    el = fixture.nativeElement as HTMLElement;
    document.body.appendChild(el);
    fixture.componentInstance.value.set(value);
    fixture.detectChanges();
    // afterNextRender is where the focus happens, and it is not synchronous.
    await fixture.whenStable();
  }

  beforeEach(() => TestBed.resetTestingModule());

  it('takes the caret when it is revealed, which autofocus never did', async () => {
    await render();
    expect(document.activeElement).toBe(input());
  });

  it('opens a rename on the existing text, selected, so typing replaces it', async () => {
    await render('Diecast');
    expect(input().value).toBe('Diecast');
    expect([input().selectionStart, input().selectionEnd]).toEqual([0, 'Diecast'.length]);
  });

  it('commits the trimmed draft on Enter', async () => {
    await render();
    type('  Ouro  ');

    const event = key('Enter');

    expect(event.defaultPrevented).toBe(true);
    expect(fixture.componentInstance.committed).toEqual(['Ouro']);
  });

  it('treats an empty Enter as a cancellation rather than an empty name', async () => {
    await render();
    type('   ');
    key('Enter');

    expect(fixture.componentInstance.committed).toEqual([]);
    expect(fixture.componentInstance.cancelled).toBe(1);
  });

  it('cancels on Escape without committing what was typed', async () => {
    await render();
    type('Prata');

    key('Escape');

    expect(fixture.componentInstance.committed).toEqual([]);
    expect(fixture.componentInstance.cancelled).toBe(1);
  });

  it('keeps Escape from also closing whatever it sits inside', async () => {
    await render();

    key('Escape');

    // Asserted through an ancestor listener rather than event.cancelBubble,
    // which the DOM spec clears once dispatch finishes.
    expect(fixture.componentInstance.bubbled).toBe(0);
  });

  it('commits on blur, so a typed name is not lost by clicking elsewhere', async () => {
    await render();
    type('Bronze');

    input().dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(fixture.componentInstance.committed).toEqual(['Bronze']);
  });

  it('cancels on blur where the caller says a click elsewhere means never mind', async () => {
    await render();
    fixture.componentInstance.commitOnBlur.set(false);
    fixture.detectChanges();
    type('Bronze');

    input().dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(fixture.componentInstance.committed).toEqual([]);
    expect(fixture.componentInstance.cancelled).toBe(1);
  });

  describe('where focus lands when the box goes away', () => {
    /** Opens the composer the way a user does: from the button. */
    async function openFromButton() {
      fixture = TestBed.createComponent(Host);
      el = fixture.nativeElement as HTMLElement;
      document.body.appendChild(el);
      fixture.componentInstance.open.set(false);
      fixture.detectChanges();
      const opener = el.querySelector('button') as HTMLButtonElement;
      opener.focus();
      opener.click();
      fixture.detectChanges();
      await fixture.whenStable();
      return opener;
    }

    it('gives focus back to the button that opened it, on Escape', async () => {
      // It used to land on <body>, so the next Tab restarted at the skip link
      // ~20 stops from the button just pressed.
      const opener = await openFromButton();

      key('Escape');

      expect(document.activeElement).toBe(opener);
    });

    it('gives focus back on Enter too, and still commits', async () => {
      const opener = await openFromButton();
      type('Prata');

      key('Enter');

      expect(fixture.componentInstance.committed).toEqual(['Prata']);
      expect(document.activeElement).toBe(opener);
    });

    it('does not take focus back on a blur: it went where the user put it', async () => {
      const opener = await openFromButton();
      const elsewhere = document.createElement('button');
      document.body.appendChild(elsewhere);
      type('Ouro');

      elsewhere.focus();
      input().dispatchEvent(new Event('blur'));
      fixture.detectChanges();

      expect(fixture.componentInstance.committed).toEqual(['Ouro']);
      expect(document.activeElement).toBe(elsewhere);
      expect(document.activeElement).not.toBe(opener);
      elsewhere.remove();
    });

    it('lands on the main landmark when the opener went with the answer', async () => {
      // The delete case: the control that opened the box is destroyed by what
      // the box did, so there is nothing to give focus back to.
      const main = document.createElement('main');
      main.id = 'main-content';
      main.tabIndex = -1;
      document.body.appendChild(main);
      const opener = await openFromButton();
      opener.remove();

      key('Escape');

      expect(document.activeElement).toBe(main);
      main.remove();
    });
  });

  it('answers once: Enter followed by the blur it causes commits a single time', async () => {
    await render();
    type('Ouro');

    key('Enter');
    input().dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(fixture.componentInstance.committed).toEqual(['Ouro']);
    expect(fixture.componentInstance.cancelled).toBe(0);
  });
});
