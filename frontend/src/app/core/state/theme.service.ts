import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';

import { THEMES } from '../api/seed-data';
import { ThemeDef, ThemeId } from '../models';

const STORAGE_KEY = 'vault.theme';
const DEFAULT_THEME: ThemeId = 'devlight';

/**
 * Owns the active visual theme. Applying a theme sets `data-theme` on <html>,
 * which switches the CSS custom properties defined in styles/_themes.scss.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);

  readonly themes: readonly ThemeDef[] = THEMES;
  readonly current = signal<ThemeId>(this.restore());

  constructor() {
    effect(() => {
      this.document.documentElement.setAttribute('data-theme', this.current());
    });
  }

  get currentDef(): ThemeDef {
    return this.themes.find(t => t.id === this.current()) ?? this.themes[0];
  }

  apply(id: ThemeId): void {
    this.current.set(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Preference just won't survive the reload.
    }
  }

  private restore(): ThemeId {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ThemeId | null;
      return saved && THEMES.some(t => t.id === saved) ? saved : DEFAULT_THEME;
    } catch {
      return DEFAULT_THEME;
    }
  }
}
