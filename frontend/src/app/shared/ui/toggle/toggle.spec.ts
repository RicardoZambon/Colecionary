import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { UiToggle } from './toggle';

@Component({
  imports: [UiToggle],
  template: `<ui-toggle [(on)]="on" [disabled]="disabled()" [ariaLabel]="'Link sharing'" />`,
})
class Host {
  readonly on = signal(false);
  readonly disabled = signal(false);
}

describe('UiToggle', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<Host>>;

  function track() {
    return fixture.nativeElement.querySelector('[role=switch]') as HTMLButtonElement;
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
  });

  it('flips on click and says so in aria', () => {
    track().click();
    fixture.detectChanges();

    expect(fixture.componentInstance.on()).toBe(true);
    expect(track().getAttribute('aria-checked')).toBe('true');
  });

  it('refuses the click while disabled', () => {
    fixture.componentInstance.disabled.set(true);
    fixture.detectChanges();

    track().click();
    fixture.detectChanges();

    expect(fixture.componentInstance.on()).toBe(false);
  });

  it('stays reachable while disabled, so the reason beside it can be read', () => {
    fixture.componentInstance.disabled.set(true);
    fixture.detectChanges();

    // aria-disabled, not the native attribute: `disabled` takes the switch out
    // of the tab order, and a switch nobody can reach cannot explain itself —
    // which is the whole purpose of the state (link sharing describes a public
    // page that does not exist yet).
    expect(track().getAttribute('aria-disabled')).toBe('true');
    expect(track().disabled).toBe(false);

    track().focus();
    expect(document.activeElement).toBe(track());
  });
});
