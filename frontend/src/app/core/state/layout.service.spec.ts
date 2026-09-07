import { DOCUMENT } from '@angular/common';
import { ApplicationRef } from '@angular/core';
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

/**
 * Enough of a document for the focus rescue: what has focus now, and the one
 * element it may put it on.
 */
function fakeDocument(matchMedia: () => unknown) {
  // querySelector because ApplicationRef asks the body for the app root.
  const body = { tagName: 'BODY', querySelector: () => null, querySelectorAll: () => [] };
  const main = { id: 'main-content', focus: vi.fn() };
  return {
    doc: {
      defaultView: { matchMedia },
      body,
      activeElement: body as unknown,
      getElementById: (id: string) => (id === main.id ? main : null),
    },
    body,
    main,
  };
}

describe('LayoutService', () => {
  let events: Subject<unknown>;
  let harness: ReturnType<typeof fakeMedia>;
  let doc: ReturnType<typeof fakeDocument>;

  function build(compactInitially = true): LayoutService {
    events = new Subject<unknown>();
    harness = fakeMedia(compactInitially);
    const matchMedia = vi.fn(() => harness.media);
    doc = fakeDocument(matchMedia);
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { events } },
        { provide: DOCUMENT, useValue: doc.doc },
      ],
    });
    return TestBed.inject(LayoutService);
  }

  /** Runs the afterNextRender the rescue schedules. */
  async function render(): Promise<void> {
    TestBed.inject(ApplicationRef).tick();
    await Promise.resolve();
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

  it('puts focus in the page when a navigation dropped it on the body', async () => {
    // Nothing focused anything on a route change, so a link inside the outgoing
    // page took focus with it and the next Tab restarted at the skip link, ~20
    // stops of chrome away.
    build();

    events.next(new NavigationEnd(1, '/dashboard', '/dashboard'));
    await render();

    expect(doc.main.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('leaves focus alone when something survived the navigation', async () => {
    // The item page's previous/next links navigate in place. A reader stepping
    // through a collection with them must not be thrown to the top of the page
    // after every step.
    const layout = build();
    doc.doc.activeElement = { tagName: 'A', isConnected: true };

    events.next(new NavigationEnd(1, '/c/retro/i/1', '/c/retro/i/2'));
    await render();

    expect(doc.main.focus).not.toHaveBeenCalled();
    expect(layout.navOpen()).toBe(false);
  });

  it('yields to a page that focuses something of its own', async () => {
    build();

    events.next(new NavigationEnd(1, '/c/new/settings', '/c/new/settings'));
    // A fresh collection's name box takes the caret between the navigation and
    // the render the rescue waits for; that choice outranks this one.
    doc.doc.activeElement = { tagName: 'INPUT', isConnected: true };
    await render();

    expect(doc.main.focus).not.toHaveBeenCalled();
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
    // And no activeElement, and no getElementById: the rescue must not be the
    // thing that breaks a navigation.
    events.next(new NavigationEnd(1, '/dashboard', '/dashboard'));
    expect(layout.compact()).toBe(false);
    expect(layout.navOpen()).toBe(false);
  });

  it('persists nothing — the drawer is a gesture, not a preference', () => {
    const layout = build();
    layout.toggleNav();
    expect(Object.keys(localStorage).some(k => k.startsWith('vault.nav'))).toBe(false);
  });
});
