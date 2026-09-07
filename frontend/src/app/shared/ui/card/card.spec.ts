import { describe, expect, it } from 'vitest';

/**
 * A clickable card must contain a real link or button, never *be* one.
 *
 * `ui-card` is a `<div>`. Putting `[routerLink]` or `(click)` on the host makes
 * the whole card a click target that is not focusable, has no role, has no
 * accessible name and answers no key — so on the dashboard every collection,
 * and in settings every theme and every language, could be reached only with a
 * pointer. The fix at each call site is a real `<a>` or `<button>` *inside* the
 * card, which is what all of them now do.
 *
 * This is a spec rather than a component change because the obvious component
 * change does not work: `ui-card` projects with a single `<ng-content>`, and
 * content is projected once, so a conditional `<a>` wrapper around it is
 * fragile in a way that would be worse than the convention. And it is a spec
 * rather than a review note because two files never appear in the same diff —
 * a reviewer cannot see that the pattern slipped, but a grep can.
 *
 * Same shape and same reasoning as `styles/z-index.spec.ts`: the mistake
 * compiles and ships, so something has to fail the build.
 */

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

function templateFiles(root: string): string[] {
  const fs = nodeFs();
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(`${cwd()}/${dir}`, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      // `.ts` too: most of `shared/ui` carries its template inline.
      else if (/\.(html|ts)$/.test(entry.name) && !entry.name.endsWith('.spec.ts')) found.push(path);
    }
  };
  walk(root);
  return found;
}

describe('a clickable ui-card', () => {
  const fs = nodeFs();
  const files = templateFiles('src/app');

  it('finds the templates, so a broken walk cannot silently pass', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('never carries the click on the card itself', () => {
    const onHost: string[] = [];

    for (const file of files) {
      const text = fs.readFileSync(`${cwd()}/${file}`, 'utf8');
      // Each `<ui-card …>` opening tag, up to its closing angle bracket. A
      // greedy match would swallow the whole card and report an inner anchor's
      // routerLink as the card's own.
      for (const tag of text.matchAll(/<ui-card\b[^>]*>/g)) {
        if (/\[?routerLink\]?|\(click\)/.test(tag[0])) {
          onHost.push(`${file}: ${tag[0].replace(/\s+/g, ' ').slice(0, 80)}`);
        }
      }
    }

    expect(
      onHost,
      'put a real <a> or <button> inside the card instead — a div with a click is not a link',
    ).toEqual([]);
  });
});
