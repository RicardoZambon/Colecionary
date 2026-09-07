import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { NotFound } from './not-found';

describe('NotFound', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    });
  });

  function mount() {
    const fixture = TestBed.createComponent(NotFound);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('offers its two ways out as separate actions, so the gap between them exists', () => {
    // Both were wrapped in one projected <div>, and ui-empty's slot is what
    // carries the gap — so they were painted edge to edge and read as a single
    // segmented control.
    const actions = mount().querySelector('.actions') as HTMLElement;

    expect([...actions.children].map(c => c.tagName.toLowerCase())).toEqual([
      'ui-button',
      'ui-button',
    ]);
  });

  it('names the address it could not open, which the old redirect destroyed', () => {
    expect(mount().querySelector('.body')?.textContent).toContain('/');
  });
});
