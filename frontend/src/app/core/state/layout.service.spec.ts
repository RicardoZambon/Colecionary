import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LayoutService } from './layout.service';

/** A `matchMedia` stand-in whose `matches` can be flipped from the test. */
function fakeMedia(initial: boolean) {
  const listeners: ((e: { matches: boolean }) => void)[] = [];
  const media = {
    matches: initial,
    addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.push(fn),
    removeEventListener: () => undefined,
  };
  return {
    media,
    resizeTo(matches: boolean) {
      media.matches = matches;
      listeners.forEach(fn => fn({ matches }));
    },
  };
}

describe('LayoutService', () => {
  let events: Subject<unknown>;
  let harness: ReturnType<typeof fakeMedia>;

  function build(compactInitially = true): LayoutService {
    events = new Subject<unknown>();
    harness = fakeMedia(compactInitially);
    const matchMedia = vi.fn(() => harness.media);
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { events } },
        { provide: DOCUMENT, useValue: { defaultView: { matchMedia } } },
      ],
    });
    return TestBed.inject(LayoutService);
  }

  beforeEach(() => TestBed.resetTestingModule());

  it('starts closed', () => {
    expect(build().navOpen()).toBe(false);
  });

  it('toggles both ways', () => {
    const layout = build();
    layout.toggleNav();
    expect(layout.navOpen()).toBe(true);
    layout.toggleNav();
    expect(layout.navOpen()).toBe(false);
  });

  it('closeNav is idempotent', () => {
    const layout = build();
    layout.closeNav();
    layout.toggleNav();
    layout.closeNav();
    layout.closeNav();
    expect(layout.navOpen()).toBe(false);
  });

  it('closes on NavigationEnd, so the destination is not hidden behind the drawer', () => {
    const layout = build();
    layout.toggleNav();
    events.next(new NavigationEnd(1, '/dashboard', '/dashboard'));
    expect(layout.navOpen()).toBe(false);
  });

  it('ignores router events that are not a completed navigation', () => {
    const layout = build();
    layout.toggleNav();
    events.next({ id: 2, url: '/store' });
    expect(layout.navOpen()).toBe(true);
  });

  it('seeds `compact` from the media query', () => {
    expect(build(true).compact()).toBe(true);
    TestBed.resetTestingModule();
    expect(build(false).compact()).toBe(false);
  });

  it('tracks the media query, and widening also closes the drawer', () => {
    const layout = build(true);
    layout.toggleNav();
    harness.resizeTo(false);
    expect(layout.compact()).toBe(false);
    // Otherwise rotating back to portrait reopens a menu nobody asked for.
    expect(layout.navOpen()).toBe(false);
  });

  it('narrowing does not open the drawer on its own', () => {
    const layout = build(false);
    harness.resizeTo(true);
    expect(layout.compact()).toBe(true);
    expect(layout.navOpen()).toBe(false);
  });

  it('survives an environment with no matchMedia', () => {
    events = new Subject<unknown>();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { events } },
        { provide: DOCUMENT, useValue: {} },
      ],
    });
    const layout = TestBed.inject(LayoutService);
    expect(layout.compact()).toBe(false);
    expect(layout.navOpen()).toBe(false);
  });

  it('persists nothing — the drawer is a gesture, not a preference', () => {
    const layout = build();
    layout.toggleNav();
    expect(Object.keys(localStorage).some(k => k.startsWith('vault.nav'))).toBe(false);
  });
});
