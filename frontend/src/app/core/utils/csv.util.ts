/**
 * Delimited text, parsed and written — the transport layer of the CSV import,
 * and nothing above it.
 *
 * It knows about quoting, line endings and the byte-order mark. It knows
 * nothing about items, groups or conditions: that is `csv-import.ts`, and the
 * split is what lets the quoting rules be tested against the awkward inputs
 * (a `;` inside a name, a doubled quote, a CRLF file from Excel) without
 * building a collection to hold them.
 */

/**
 * The separators a header line is sniffed for, in preference order.
 *
 * Semicolon leads because pt-BR is the app's first language and Excel in a
 * comma-decimal locale writes `;` — the same locale that spells four thousand
 * two hundred `4.200,00`, which a comma-separated file cannot hold without
 * quoting every amount. A comma-separated file still parses; it is simply not
 * what the template hands out.
 */
export const CSV_DELIMITERS = [';', ',', '\t'] as const;

export type CsvDelimiter = (typeof CSV_DELIMITERS)[number];

/** The delimiter the template writes, and the fallback when sniffing finds none. */
export const DEFAULT_DELIMITER: CsvDelimiter = ';';

/** One parsed record, carrying the physical line it started on. */
export interface CsvRow {
  /**
   * 1-based line number in the original text, for error messages.
   *
   * The *starting* line: a quoted cell may span several, and reporting the line
   * a record ended on would send the user to the wrong place in their file.
   */
  line: number;
  cells: string[];
}

/**
 * Which separator a text uses, guessed from its first non-empty line.
 *
 * Counting occurrences outside quotes rather than raw ones matters for exactly
 * the case that motivates the sniff: a semicolon file whose header holds
 * `"Ano, mês"` would otherwise be read as comma-separated on the strength of
 * one comma inside a quoted cell.
 */
export function detectDelimiter(text: string): CsvDelimiter {
  const header = firstRecord(stripBom(text));
  let best: CsvDelimiter = DEFAULT_DELIMITER;
  let bestCount = 0;
  for (const delimiter of CSV_DELIMITERS) {
    const count = countUnquoted(header, delimiter);
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Records, in file order, with blank lines dropped.
 *
 * Blank lines are dropped rather than yielded as one-empty-cell rows because a
 * trailing newline is universal and "row 18 has no name" is not a defect worth
 * reporting to someone whose file simply ends the way every file ends. A line
 * of nothing but delimiters (`;;;;`) is *not* blank — that is a row someone
 * cleared, and it earns its error.
 *
 * Quoting follows RFC 4180: a cell may be wrapped in `"`, in which case a
 * delimiter, a newline and a doubled `""` all pass through literally. An
 * unterminated quote runs to the end of the text rather than throwing — half a
 * cell is recoverable and reports as a row error upstream, where a thrown
 * exception would take the whole paste down over one stray character.
 */
export function parseCsv(text: string, delimiter: CsvDelimiter = DEFAULT_DELIMITER): CsvRow[] {
  const source = stripBom(text);
  const rows: CsvRow[] = [];

  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  let touched = false;

  const endCell = () => {
    cells.push(cell);
    cell = '';
  };
  const endRow = () => {
    endCell();
    // `touched` is what tells `""` (a row holding one deliberately empty cell)
    // apart from a bare line ending, which produces the identical cell array.
    if (touched || cells.length > 1) rows.push({ line: rowLine, cells });
    cells = [];
    touched = false;
    rowLine = line;
  };

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];

    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        if (ch === '\n') line++;
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
      touched = true;
      continue;
    }
    if (ch === delimiter) {
      endCell();
      touched = true;
      continue;
    }
    if (ch === '\r') continue;
    if (ch === '\n') {
      line++;
      endRow();
      continue;
    }
    cell += ch;
    if (ch.trim()) touched = true;
  }

  endRow();
  return rows;
}

/**
 * Rows as delimited text, quoting only the cells that need it.
 *
 * Quoting everything would be equally correct and is what most writers do; this
 * one does not, because its only caller is the downloadable template and a
 * template a person is meant to read and extend should look like the example
 * they were shown, not like an escaping exercise.
 */
export function toCsv(
  rows: readonly (readonly string[])[],
  delimiter: CsvDelimiter = DEFAULT_DELIMITER,
): string {
  return rows.map(row => row.map(cell => quoteCell(cell, delimiter)).join(delimiter)).join('\r\n');
}

function quoteCell(cell: string, delimiter: CsvDelimiter): string {
  return cell.includes(delimiter) || /["\r\n]/.test(cell)
    ? `"${cell.replace(/"/g, '""')}"`
    : cell;
}

/**
 * A leading U+FEFF, removed.
 *
 * Excel writes one on every UTF-8 export, and left in place it becomes part of
 * the first header's name — so `Nome` stops matching `Nome` and every row loses
 * its name column, with nothing on screen to explain why.
 */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** The first record's raw text, quotes included — what the sniff looks at. */
function firstRecord(text: string): string {
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') quoted = !quoted;
    else if (text[i] === '\n' && !quoted) return text.slice(0, i);
  }
  return text;
}

function countUnquoted(text: string, delimiter: CsvDelimiter): number {
  let quoted = false;
  let count = 0;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (ch === delimiter && !quoted) count++;
  }
  return count;
}
