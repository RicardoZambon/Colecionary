import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TabDef, UiTabs } from './tabs';

const TABS: TabDef[] = [
  { id: 'appearance', label: 'Aparência' },
  { id: 'plan', label: 'Plano' },
  { id: 'access', label: 'Compartilhamento e acesso' },
  { id: 'account', label: 'Conta e dados' },
];

@Component({
  imports: [UiTabs],
  template: `
    <ui-tabs #strip [tabs]="tabs" [(active)]="active" [panels]="panels()" />
    <div
      role="tabpanel"
      [id]="strip.panelDomId(active())"
      [attr.aria-labelledby]="strip.tabDomId(active())"
    ></div>
  `,
})
class Host {
  readonly tabs = TABS;
  readonly active = signal('appearance');
  readonly panels = signal(true);
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

  it('names the panel each tab controls, and the panel names the tab back', () => {
    const panel = el.querySelector('[role=tabpanel]') as HTMLElement;
    expect(tabs()[0].getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs()[0].id);
  });

  it('claims nothing when the caller renders no panel', () => {
    fixture.componentInstance.panels.set(false);
    fixture.detectChanges();
    // An aria-controls pointing at an id that does not exist is worse than none.
    expect(tabs()[0].getAttribute('aria-controls')).toBe(null);
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
