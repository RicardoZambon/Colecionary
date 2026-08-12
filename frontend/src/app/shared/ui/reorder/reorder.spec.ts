import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

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

  it('disables the edges so an item cannot move past the ends', () => {
    const { host, buttons } = mount({ first: true, last: true });

    expect(buttons.map(b => b.disabled)).toEqual([true, true]);
    buttons[0].click();
    buttons[1].click();
    expect(host.moves).toEqual([]);
  });

  it('names each direction for screen readers', () => {
    const { buttons } = mount();

    expect(buttons.map(b => b.getAttribute('aria-label'))).toEqual([
      'Move Sonic the Comic earlier',
      'Move Sonic the Comic later',
    ]);
  });
});
