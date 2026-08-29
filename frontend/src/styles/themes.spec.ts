import { describe, expect, it } from 'vitest';

/**
 * Contrast is a property of the palette, so it is pinned where the palette
 * lives rather than on the components that consume it.
 *
 * Every readable colour in every theme is checked against both surfaces it can
 * land on. This exists because `--muted` had drifted to 2.4–4.4:1 across the
 * seven themes while carrying the entire secondary type layer — every count,
 * ratio, micro-heading and placeholder in the app. A reviewer cannot see 3.3:1;
 * an eighth theme's author certainly cannot. The arithmetic can.
 *
 * `--panel2` is included even though it is one step further than the brief
 * asked for: in a dark theme it is the *lightest* of the three surfaces, so it
 * is the one a label is most likely to fail on, and the image-slot placeholder
 * and the progress track both sit on it.
 */

/** WCAG 2.1 AA for body text. Large text would allow 3:1; none of this is large. */
const AA = 4.5;

/**
 * The colours that carry meaning. `--muted` is excluded on purpose — see below,
 * and so are the raw `--accent` / `--accent2`: those are chosen to be *seen* (a
 * bar fill, a border, a button ground), which is a 3:1 job. Their `-strong`
 * siblings are the ones type is allowed to use, and they are held here.
 */
const READABLE = ['muted-strong', 'accent-strong', 'accent2-strong', 'text2', 'text'] as const;

/** Surfaces a label can sit on. */
const SURFACES = ['bg', 'panel', 'panel2'] as const;

/**
 * Angular's unit-test builder bundles specs through esbuild for the browser, so
 * `import 'node:fs'` neither type-checks (there are no `@types/node` here) nor
 * resolves. `process` is present at runtime, and Node 22's
 * `process.getBuiltinModule` hands back the real module without a bundler-
 * visible import — which is exactly what is wanted: the spec must read the
 * shipped `.scss`, never a copy of it, or it becomes a second source of truth
 * that agrees with itself while the app fails.
 */
function readThemesScss(): string {
  const read = new Function(
    'return process.getBuiltinModule("node:fs").readFileSync(' +
      'process.cwd() + "/src/styles/_themes.scss", "utf8")',
  ) as () => string;
  return read();
}

/** id → { token: hex }. The default theme's `:root` block is `devlight`. */
function parseThemes(scss: string): Record<string, Record<string, string>> {
  const themes: Record<string, Record<string, string>> = {};
  // Strip comments first: they carry hex values (the measured ratios and the
  // shadow notes), and a naive scan would read those as declarations.
  const clean = scss.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  const blocks = clean.matchAll(/(:root|\[data-theme='([\w-]+)'\])\s*\{([^}]*)\}/g);
  for (const block of blocks) {
    const body = block[3];
    const declared: Record<string, string> = {};
    for (const decl of body.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)) {
      declared[decl[1]] = decl[2].toUpperCase();
    }
    // The structural `:root` (spacing, motion, z-index) declares no colour.
    if (!Object.keys(declared).length) continue;
    const id = block[2] ?? 'devlight';
    themes[id] = { ...themes[id], ...declared };
  }
  return themes;
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.1 relative-contrast ratio, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const themes = parseThemes(readThemesScss());
const ids = Object.keys(themes);

describe('theme palettes', () => {
  it('finds every theme, so a parser regression cannot silently pass the suite', () => {
    // A broken regex would yield {} and every `it.each` below would vanish.
    expect(ids.sort()).toEqual(
      ['arcade', 'devdark', 'devlight', 'hud', 'paper', 'synth', 'terminal'].sort(),
    );
  });

  it.each(ids)('%s declares every surface and readable colour', id => {
    for (const token of [...SURFACES, ...READABLE]) {
      expect(themes[id][token], `${id} is missing --${token}`).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  describe.each(ids)('%s', id => {
    it.each(READABLE)(`--%s clears AA on every surface`, token => {
      for (const surface of SURFACES) {
        const measured = contrastRatio(themes[id][token], themes[id][surface]);
        expect(
          Math.round(measured * 100) / 100,
          `--${token} (${themes[id][token]}) on --${surface} (${themes[id][surface]}) in ${id}`,
        ).toBeGreaterThanOrEqual(AA);
      }
    });
  });

  /**
   * `--muted` is not asserted against AA, and that is the point of it existing.
   * It is the decorative grey — a hairline, a watermark glyph, a repeat of what
   * the row already says in `--text`. Pinning it here would either force it up
   * until it is indistinguishable from `--muted-strong` (two tokens, one
   * colour, no reason to choose) or invite someone to relax the threshold for
   * all of them. Instead this pins the *relationship*: whatever a theme does,
   * `--muted-strong` must be the readable one.
   */
  it.each(ids)('%s keeps --muted-strong more readable than --muted', id => {
    const surface = themes[id]['panel'];
    expect(contrastRatio(themes[id]['muted-strong'], surface)).toBeGreaterThan(
      contrastRatio(themes[id]['muted'], surface),
    );
  });
});
