import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TabDef, UiTabPanel, UiTabs } from './tabs';

const TABS: TabDef[] = [
  { id: 'appearance', label: 'Aparência' },
  { id: 'plan', label: 'Plano' },
  { id: 'access', label: 'Compartilhamento e acesso' },
  { id: 'account', label: 'Conta e dados' },
];

@Component({
  imports: [UiTabPanel, UiTabs],
  template: `
    <ui-tabs #strip [tabs]="tabs" [(active)]="active" />
    @if (panel()) {
      <div [uiTabPanel]="strip"></div>
    }
  `,
})
class Host {
  readonly tabs = TABS;
  readonly active = signal('appearance');
  /** The caller's panel, behind an @if — the shape the registration exists for. */
  readonly panel = signal(true);
  readonly strip = viewChild.required(UiTabs);
}

describe('UiTabs', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<Host>>;
  let el: HTMLElement;

  function tabs() {
    return [...el.querySelectorAll<HTMLButtonElement>('[role=tab]')];
  }

  function key(name: string) {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
    (document.activeElement ?? el).dispatchEvent(event);
    fixture.detectChanges();
    return event;
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    fixture = TestBed.createComponent(Host);
    el = fixture.nativeElement as HTMLElement;
    document.body.appendChild(el);
    fixture.detectChanges();
  });

  it('is one tab stop, not four: only the selected tab is reachable with Tab', () => {
    expect(tabs().map(t => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1']);
  });

  it('names the panel the selected tab controls, and the panel names the tab back', () => {
    const panel = el.querySelector('[role=tabpanel]') as HTMLElement;
    expect(tabs()[0].getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs()[0].id);
  });

  it('advertises aria-controls on the selected tab only, and it resolves', () => {
    // The defect this replaces: all four tabs claimed a panel while the page
    // rendered one, so three of the four ids were not in the document at all.
    const claiming = tabs().filter(t => t.getAttribute('aria-controls'));
    expect(claiming).toEqual([tabs()[0]]);
    expect(document.getElementById(claiming[0].getAttribute('aria-controls') as string)).toBe(
      el.querySelector('[role=tabpanel]'),
    );
  });

  it('follows the selection, so the claim never outlives the panel it names', () => {
    fixture.componentInstance.active.set('access');
    fixture.detectChanges();

    const panel = el.querySelector('[role=tabpanel]') as HTMLElement;
    const claiming = tabs().filter(t => t.getAttribute('aria-controls'));
    expect(claiming).toEqual([tabs()[2]]);
    expect(claiming[0].getAttribute('aria-controls')).toBe(panel.id);
  });

  it('claims nothing when the caller renders no panel', () => {
    fixture.componentInstance.panel.set(false);
    fixture.detectChanges();
    // An aria-controls pointing at an id that does not exist is worse than none,
    // and with no uiTabPanel registered there is no id to point at.
    expect(tabs().some(t => t.getAttribute('aria-controls'))).toBe(false);
  });

  it('does not make the panel a tab stop: its own content already is', () => {
    expect(el.querySelector('[role=tabpanel]')?.getAttribute('tabindex')).toBe(null);
  });

  it('moves with the arrows, which role=tab promises and this did not deliver', () => {
    tabs()[0].focus();

    key('ArrowRight');

    expect(fixture.componentInstance.active()).toBe('plan');
    expect(document.activeElement).toBe(tabs()[1]);
  });

  it('wraps at both ends and jumps with Home and End', () => {
    tabs()[0].focus();
    key('ArrowLeft');
    expect(fixture.componentInstance.active()).toBe('account');

    key('Home');
    expect(fixture.componentInstance.active()).toBe('appearance');

    key('End');
    expect(fixture.componentInstance.active()).toBe('account');
    expect(document.activeElement).toBe(tabs()[3]);
  });

  it('leaves other keys to the page', () => {
    tabs()[0].focus();
    const event = key('ArrowDown');
    expect(event.defaultPrevented).toBe(false);
    expect(fixture.componentInstance.active()).toBe('appearance');
  });

  it('says which tab is selected, in aria as well as in colour', () => {
    expect(tabs().map(t => t.getAttribute('aria-selected'))).toEqual([
      'true',
      'false',
      'false',
      'false',
    ]);
  });
});
