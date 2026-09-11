import { describe, expect, it } from 'vitest';

/**
 * `--muted` is decoration. This counts who spends it.
 *
 * `themes.spec.ts` next door proves the *palette* is readable, and deliberately
 * exempts `--muted` from AA — the whole point of having two greys is that one of
 * them is allowed to be quiet. But that exemption is only true while nothing
 * readable uses it, and the palette test cannot see who does. An audit found
 * **89** `color: var(--muted)` sites against 28 using `--muted-strong`, and
 * almost all 89 were words: page subtitles, card meta lines, table cells, empty
 * states, tab labels, the "collection not found" sentence, the conflict
 * notice's hint, and `ui-field`'s own form label at 10px. Each measured
 * 2.4–4.4:1 depending on theme. Every one of them was cashing in an exemption
 * it had not earned.
 *
 * So the allowlist below is the whole argument, written down. Each entry is a
 * mark that **repeats something already said beside it** — which is what makes
 * a below-AA grey harmless there and nowhere else. Adding a site means either
 * naming that repetition here, or reaching for `--muted-strong`, and the
 * friction is the feature: this is a judgement, and it should cost a sentence.
 *
 * A count and not just a file list, so a bad use cannot hide inside a file that
 * has a good one.
 */
const ALLOWED: { file: string; count: number; because: string }[] = [
  {
    file: 'app/layout/topbar/topbar.scss',
    count: 1,
    because: 'the caret inside the theme/language trigger — the trigger already says it opens a menu',
  },
  {
    file: 'app/features/collection/collection-page/group-breadcrumb/group-breadcrumb.ts',
    count: 1,
    because: 'the separator between crumbs — the trail already shows the nesting',
  },
  {
    file: 'app/features/collection/collection-page/item-grid/item-grid.scss',
    count: 2,
    because: 'the flat no-image ground, and the dimmed no-photo mark the standard asks for',
  },
  {
    file: 'app/features/collection/item-page/item-page.scss',
    count: 1,
    because: 'the chevron inside the labelled prev/next control',
  },
  {
    file: 'app/features/store/store-page.scss',
    count: 1,
    because: 'the initial-letter watermark, which repeats the name printed under it',
  },
  {
    file: 'app/features/collection/collection-settings-page/group-delete-dialog/group-delete-dialog.ts',
    count: 1,
    because: 'a disabled control, which is what a dimmed grey is for',
  },
];

/**
 * Angular's unit-test builder bundles specs through esbuild for the browser, so
 * `import 'node:fs'` neither type-checks (there are no `@types/node` here) nor
 * resolves — the same constraint `themes.spec.ts` documents, solved the same
 * way. The files must be the ones that ship, never a copy.
 */
function scanSources(): { file: string; count: number }[] {
  const scan = new Function(
    'const fs = process.getBuiltinModule("node:fs");' +
      'const path = process.getBuiltinModule("node:path");' +
      'const root = process.cwd() + "/src/app";' +
      'const out = [];' +
      'const walk = dir => {' +
      '  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {' +
      '    const full = path.join(dir, entry.name);' +
      '    if (entry.isDirectory()) { walk(full); continue; }' +
      '    if (!/\\.(scss|ts)$/.test(entry.name)) continue;' +
      '    if (/\\.spec\\.ts$/.test(entry.name)) continue;' +
      '    const text = fs.readFileSync(full, "utf8");' +
      '    const hits = text.match(/color:\\s*var\\(--muted\\)/g);' +
      '    if (hits) out.push({' +
      '      file: full.replace(/\\\\/g, "/").slice(full.replace(/\\\\/g, "/").indexOf("/src/app") + 5),' +
      '      count: hits.length,' +
      '    });' +
      '  }' +
      '};' +
      'walk(root);' +
      'return out;',
  ) as () => { file: string; count: number }[];
  return scan();
}

describe('--muted is spent only on decoration', () => {
  const found = scanSources();
  const allowed = new Map(ALLOWED.map(entry => [entry.file, entry.count]));

  it('is used in no file that has not argued for it', () => {
    const unexpected = found.filter(entry => !allowed.has(entry.file)).map(entry => entry.file);
    // If this fails: the colour is below AA on purpose. Text wants
    // `--muted-strong`. If the new use really is a mark that repeats something
    // already said next to it, add it to ALLOWED with the reason.
    expect(unexpected).toEqual([]);
  });

  it('is used exactly as many times as each of those files argued for', () => {
    const drifted = found
      .filter(entry => allowed.has(entry.file) && allowed.get(entry.file) !== entry.count)
      .map(entry => `${entry.file}: ${entry.count} (allowed ${allowed.get(entry.file)})`);
    expect(drifted).toEqual([]);
  });

  it('has no allowlist entry for a file that no longer uses it', () => {
    // A stale exemption is an exemption nobody is checking. `group-delete-dialog`
    // lost one this way, when its sub-line became `ui-radio`'s hint.
    const counts = new Map(found.map(entry => [entry.file, entry.count]));
    const stale = ALLOWED.filter(entry => !counts.has(entry.file)).map(entry => entry.file);
    expect(stale).toEqual([]);
  });

  it('keeps a reason beside every exemption', () => {
    expect(ALLOWED.filter(entry => entry.because.trim().length < 20)).toEqual([]);
  });
});
