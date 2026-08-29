/**
 * Finds a backtick inside an inline `template:` or `styles:` block.
 *
 *   node scripts/check-inline-literals.mjs
 *
 * A standalone script and NOT a Vitest spec, deliberately. The mistake always
 * breaks the build, so a spec could never run to report it — `ng test` builds
 * first. Detection was never the problem. The problem is *where the compiler
 * points*: the house comment style wraps identifiers in backticks, those blocks
 * are JavaScript template literals, and a backtick in a CSS or HTML comment is
 * still a string delimiter. The literal ends early, the rest of the file becomes
 * garbage, and the compiler reports
 *
 *   NG2012: Component imports must be standalone components…
 *
 * at every *call site that imports the component* — never at the file that was
 * broken. So run this when you see NG2012, or an "Expected } but found …" in a
 * component: it names the file and the line.
 *
 * It cost four separate debugging detours on one branch before anybody wrote it
 * down. Writing token and identifier names bare inside those blocks costs
 * nothing; TSDoc above the class and `.scss` files take backticks freely.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(process.cwd(), 'src/app');

/**
 * The offending line numbers in one file's text, or an empty array.
 *
 * Finding the *real* end of the literal is the whole difficulty, and the naive
 * version got it wrong in exactly the way the bug does: it stopped at the first
 * backtick it saw — the stray one — and then looked for a stray before that
 * point, where by definition there was none.
 *
 * So instead: a backtick that genuinely closes one of these blocks is followed,
 * ignoring whitespace, by `,` or `}` or `)`. Any other backtick is inside the
 * block, which is precisely the thing that must not be there.
 */
export function backticksInsideInlineBlocks(text) {
  const hits = [];
  const opener = /(template|styles)\s*:\s*`/g;
  const lineOf = index => text.slice(0, index).split('\n').length;
  let match;

  while ((match = opener.exec(text)) !== null) {
    let i = opener.lastIndex;
    let reported = false;

    while (i < text.length) {
      if (text[i] !== '`' || text[i - 1] === '\\') {
        i++;
        continue;
      }
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === ',' || text[j] === '}' || text[j] === ')') break;

      // A pair of backticks around one identifier is one mistake, not two.
      if (!reported) {
        hits.push(lineOf(i));
        reported = true;
      }
      i++;
    }
    opener.lastIndex = i + 1;
  }
  return hits;
}

function sources(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sources(full, out);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

// Self-check first: a scanner that cannot detect its own trap is worse than
// nothing, because it reports success.
const TRAP = '@Component({\n  styles: `\n    /* uses --danger, see `theme` */\n  `,\n})';
const CLEAN = '@Component({\n  styles: `\n    /* uses --danger */\n  `,\n})';
if (backticksInsideInlineBlocks(TRAP).join() !== '3' || backticksInsideInlineBlocks(CLEAN).length) {
  console.error('check-inline-literals: the scanner failed its own self-check. Fix the script.');
  process.exit(2);
}

const files = sources(ROOT);
if (files.length < 80) {
  console.error(`check-inline-literals: only found ${files.length} files under src/app — wrong cwd?`);
  process.exit(2);
}

const offenders = files
  .map(file => ({ file: relative(process.cwd(), file), lines: backticksInsideInlineBlocks(readFileSync(file, 'utf8')) }))
  .filter(entry => entry.lines.length > 0);

if (offenders.length) {
  console.error('A backtick inside an inline template:/styles: block ends the string.');
  console.error('The compiler will blame every file that imports the component, not this one.\n');
  for (const { file, lines } of offenders) console.error(`  ${file}:${lines.join(',')}`);
  console.error('\nWrite the identifier bare inside those blocks.');
  process.exit(1);
}

console.log(`check-inline-literals: ${files.length} files clean`);
