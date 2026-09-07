import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { I18nService } from '../../../core/i18n';
import { UiReorder } from './reorder';

/** Stands in for the item card: reorder controls overlay something clickable. */
@Component({
  imports: [UiReorder],
  template: `
    <div class="card" (click)="opened = opened + 1">
      <ui-reorder
        label="Sonic the Comic"
        [first]="first"
        [last]="last"
        (moved)="moves.push($event)"
      />
    </div>
  `,
})
class HostComponent {
  opened = 0;
  first = false;
  last = false;
  moves: number[] = [];
}

function mount(patch: Partial<HostComponent> = {}) {
  // The accessible labels below are translated, so pin the language rather than
  // depending on whatever the test runner's navigator reports.
  TestBed.inject(I18nService).apply('en');
  const fixture = TestBed.createComponent(HostComponent);
  Object.assign(fixture.componentInstance, patch);
  fixture.detectChanges();
  return {
    fixture,
    host: fixture.componentInstance,
    buttons: [...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[],
  };
}

describe('UiReorder', () => {
  it('reorders without activating the clickable parent it sits on', () => {
    // Regression: the buttons live inside a card carrying a routerLink, so a
    // bubbling click opened the item instead of just moving it.
    const { host, buttons } = mount();

    buttons[0].click();
    buttons[1].click();

    expect(host.moves).toEqual([-1, 1]);
    expect(host.opened).toBe(0);
  });

  it('swallows a click that lands between the buttons', () => {
    const { fixture, host } = mount();

    fixture.nativeElement.querySelector('ui-reorder').click();

    expect(host.moves).toEqual([]);
    expect(host.opened).toBe(0);
  });

  it('reads as unavailable at the edges, and still cannot move past them', () => {
    // aria-disabled and not the disabled attribute: the browser blows focus off
    // an element the moment it becomes disabled, and the button that completes
    // the last move is the button that is about to be it. So the arrow stays
    // focusable, announces the boundary, and the handler declines.
    const { host, buttons } = mount({ first: true, last: true });

    expect(buttons.map(b => b.getAttribute('aria-disabled'))).toEqual(['true', 'true']);
    expect(buttons.map(b => b.disabled)).toEqual([false, false]);
    buttons[0].click();
    buttons[1].click();
    expect(host.moves).toEqual([]);
  });

  it('leaves focus on the arrow that was pressed, once it becomes the boundary', async () => {
    // The old answer focused the *sibling*, pre-emptively, before the emit —
    // which moved the user off the control they were operating and aimed at an
    // element the caller's re-render could destroy. Focus reached <body>.
    const { fixture, host, buttons } = mount();
    document.body.appendChild(fixture.nativeElement);

    buttons[0].focus();
    buttons[0].click();
    // What the caller's re-render does: this row is now at the top.
    host.first = true;
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.moves).toEqual([-1]);
    expect(document.activeElement).toBe(buttons[0]);
    fixture.nativeElement.remove();
  });

  it('names each direction for screen readers', () => {
    const { buttons } = mount();

    expect(buttons.map(b => b.getAttribute('aria-label'))).toEqual([
      'Move Sonic the Comic earlier',
      'Move Sonic the Comic later',
    ]);
  });
});
