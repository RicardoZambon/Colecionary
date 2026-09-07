import { describe, expect, it } from 'vitest';

/**
 * The layering scale is only a scale if everything uses it.
 *
 * `_themes.scss` declares one, with a comment saying why ("so a dropdown
 * inside a modal cannot end up behind it because two components each guessed a
 * z-index") — and then five of the seven overlays in the app guessed anyway.
 * The consequence was not theoretical: the conflict notice, the app's only
 * statement that a save did *not* happen, sat at a raw 60 — below every dialog,
 * every dropdown, the drawer and every toast.
 *
 * A reviewer cannot see this; two files never appear in the same diff. A grep
 * can. This is the same shape as `scripts/check-inline-literals.mjs`, and a
 * spec rather than a script because — unlike the backtick trap — a guessed
 * z-index compiles and ships.
 */

/**
 * Small values are a local stacking order *inside* one component — a badge over
 * its own photograph — and never a claim about the app's layering. Anything
 * above this is competing with the overlays and has to say so with a token.
 */
const LOCAL_MAX = 2;

/**
 * Files that still guess, each owned by a change already in flight. **This list
 * only ever shrinks.** Adding to it means a sixth overlay invented its own
 * layer, which is the thing this spec exists to stop.
 */
const PENDING = [
  'src/app/layout/conflict-notice/conflict-notice.ts',
  'src/app/shared/ui/lightbox/lightbox.ts',
  'src/app/shared/ui/image-focus/image-focus.ts',
  'src/app/features/settings/import-dialog/import-dialog.ts',
];

/** See the note in `themes.spec.ts` for why the module is reached this way. */
function nodeFs(): {
  readdirSync: (p: string, o: unknown) => { name: string; isDirectory(): boolean }[];
  readFileSync: (p: string, e: string) => string;
} {
  const get = new Function('return process.getBuiltinModule("node:fs")') as () => never;
  return get();
}

function cwd(): string {
  const get = new Function('return process.cwd()') as () => string;
  return get();
}

function sourceFiles(root: string): string[] {
  const fs = nodeFs();
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(`${cwd()}/${dir}`, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (/\.(ts|scss)$/.test(entry.name) && !entry.name.endsWith('.spec.ts')) found.push(path);
    }
  };
  walk(root);
  return found;
}

describe('the z-index scale', () => {
  const fs = nodeFs();
  const files = sourceFiles('src/app');

  it('finds the sources, so a broken walk cannot silently pass', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('is the only place a layer above a component is named', () => {
    const guessed: string[] = [];

    for (const file of files) {
      if (PENDING.includes(file)) continue;
      const text = fs.readFileSync(`${cwd()}/${file}`, 'utf8');
      for (const match of text.matchAll(/z-index:\s*(\d+)/g)) {
        if (Number(match[1]) > LOCAL_MAX) guessed.push(`${file}: z-index: ${match[1]}`);
      }
    }

    expect(guessed, 'use a --z-* token from _themes.scss instead').toEqual([]);
  });

  it('still has every pending file to fix, so the list cannot rot unnoticed', () => {
    // A file that no longer guesses must leave PENDING, or the exemption
    // outlives the defect and quietly covers the next one.
    for (const file of PENDING) {
      const text = fs.readFileSync(`${cwd()}/${file}`, 'utf8');
      expect(/z-index:\s*\d+/.test(text), `${file} no longer guesses — drop it from PENDING`).toBe(
        true,
      );
    }
  });
});
