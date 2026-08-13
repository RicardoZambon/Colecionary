import { describe, expect, it } from 'vitest';

import { defaultView, resolveView, viewParam } from './view-mode';

describe('view-mode', () => {
  describe('defaultView', () => {
    it('opens a group with sub-groups on the dashboard', () => {
      expect(defaultView(true)).toBe('dashboard');
    });

    it('opens a leaf straight on its items', () => {
      expect(defaultView(false)).toBe('grid');
    });
  });

  describe('resolveView', () => {
    it('honours an explicit pick', () => {
      expect(resolveView('list', true)).toBe('list');
      expect(resolveView('dashboard', false)).toBe('dashboard');
    });

    it('falls back to the default when the parameter is absent', () => {
      expect(resolveView(undefined, true)).toBe('dashboard');
      expect(resolveView(undefined, false)).toBe('grid');
    });

    it('falls back rather than trusting a hand-edited url', () => {
      expect(resolveView('gallery', true)).toBe('dashboard');
      expect(resolveView('', false)).toBe('grid');
    });
  });

  describe('viewParam', () => {
    it('drops the parameter when the pick is the default', () => {
      // Keeps the default derived per group, so drilling into a leaf lands on
      // the grid instead of on an empty dashboard.
      expect(viewParam('dashboard', true)).toBeNull();
      expect(viewParam('grid', false)).toBeNull();
    });

    it('keeps an explicit pick that differs from the default', () => {
      expect(viewParam('list', true)).toBe('list');
      expect(viewParam('grid', true)).toBe('grid');
      expect(viewParam('dashboard', false)).toBe('dashboard');
    });
  });
});
