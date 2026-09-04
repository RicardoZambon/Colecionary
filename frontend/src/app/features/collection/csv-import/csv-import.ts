import { MessageKey, MessageParams } from '../../../core/i18n';
import {
  CONDITIONS,
  Collection,
  Condition,
  CustomFieldValue,
  GroupField,
  GroupFieldType,
  GroupNode,
  Item,
  ItemCopy,
  Section,
} from '../../../core/models';
import { detectDelimiter, parseCsv } from '../../../core/utils/csv.util';
import { newCopy, syncWantedTag } from '../../../core/utils/copies.util';
import { childrenOf, fieldsFor, groupById, pathOf, subtreeIds } from '../../../core/utils/groups.util';
import { parseAmount } from '../../../core/utils/money.util';
import { sectionsOf } from '../../../core/utils/sections.util';
import { withTagAdded } from '../../../core/utils/tags.util';

/**
 * Reading a spreadsheet into a collection.
 *
 * Everything here is pure: text and a collection in, a **plan** out, and the
 * plan applied to the collection is a second, separate function. That split is
 * the whole design. An import is the one gesture in the app that can write
 * hundreds of rows from a file nobody has read line by line, so the user has to
 * be shown what it will do *before* it does it — and a preview computed by
 * different code than the write is a preview that can lie.
 * {@link planCsvImport} answers "what would happen"; {@link applyCsvImport}
 * takes that same answer and nothing else.
 *
 * ## The format is the table
 *
 * The recognised columns are the columns of the item table, under their own
 * headings in both languages: `Nome;Grupo;Ano;Exemp.;Estado;Valor`. That is not
 * a coincidence to be tidied up later. It means a user can select the table
 * they are already looking at, paste it into a sheet, extend it and paste it
 * back, and it means the format needs no documentation beyond the screen. The
 * cell spellings the table itself prints are therefore all legal input — `—`
 * for an absent value, `Quero` for a wantlist row, `Perfeito x2` for two mint
 * copies.
 *
 * Any header that is not one of those is a **custom field**, matched to the
 * group's declared fields by name (rule 4) and declared where it is missing, so
 * a column of catalogue numbers arrives as a column of catalogue numbers rather
 * than being dropped in silence.
 *
 * ## Nothing is written that was not counted
 *
 * A row that cannot be read does not stop the import; it becomes an issue with
 * its own line number and is left out of the plan. A file where every row fails
 * therefore produces an empty plan and a list of reasons, which is a far more
 * useful thing to hand back than a refusal — the user fixes eight lines and
 * re-pastes rather than guessing which one broke it.
 */

/** What an existing item with the same name in the same group does. */
export type DuplicateMode = 'skip' | 'update';

/** The built-in meaning a header can carry; anything else is a custom field. */
export type ColumnRole =
  | 'name'
  | 'group'
  | 'section'
  | 'year'
  | 'copies'
  | 'condition'
  | 'value'
  | 'tags'
  | 'description';

/** A header cell, resolved. `field` carries the name for a custom column. */
export interface ResolvedColumn {
  index: number;
  header: string;
  role: ColumnRole | 'field' | 'ignored';
  field?: string;
}

/**
 * Something the file says that the import could not act on, addressed by line.
 *
 * It carries a message *key*, not a message: pure helpers have no injector, and
 * a util that returned Portuguese would be a second, silently drifting copy of
 * the catalogue (rule 8). The dialog translates.
 */
export interface CsvImportIssue {
  /** 1-based line in the pasted text. 0 addresses the file as a whole. */
  line: number;
  key: MessageKey;
  params?: MessageParams;
}

export type RowOutcome = 'create' | 'update' | 'skip';

/** One row of the file, resolved against the collection. */
export interface PlannedRow {
  line: number;
  outcome: RowOutcome;
  /** The item as it would be written — an existing id when updating. */
  item: Item;
  /** Where it lands, spelled the way the breadcrumb spells it. */
  groupPath: string;
  /** True when the destination group does not exist yet. */
  newGroup: boolean;
}

export interface CsvImportPlan {
  columns: ResolvedColumn[];
  rows: PlannedRow[];
  issues: CsvImportIssue[];
  /** Groups the apply would create, parents before children. */
  newGroups: GroupNode[];
  /** Custom fields the apply would declare, so the values become visible. */
  newFields: { groupId: string; field: GroupField }[];
  created: number;
  updated: number;
  skipped: number;
}

export interface CsvImportOptions {
  /**
   * The group the import is scoped to — `''` at the collection root.
   *
   * This is what makes one control serve both asks. Opened inside a group, a
   * blank `Grupo` cell means *this* group and a named one is resolved inside
   * it, so a file listing sub-groups files itself correctly without repeating
   * the parent on every line. Opened at the root, a blank cell means unfiled.
   */
  scopeId: string;
  duplicates: DuplicateMode;
}

/**
 * The ceiling on one import.
 *
 * Not a storage limit — it is the size at which a single full-document PUT
 * stops being a sensible unit of work, and `GET /api/collections` returns the
 * whole vault unpaginated (a documented ceiling). Refusing at 2000 with a
 * countable reason beats timing out at 20 000 with none.
 */
export const MAX_IMPORT_ROWS = 2000;

/**
 * The ceiling on one row's copy count. A typo in a spreadsheet turns into
 * physical objects the collection claims to hold, and 500 of them is a data
 * loss nobody notices until the totals are wrong.
 */
export const MAX_COPIES_PER_ROW = 99;

const PATH_SEPARATOR = /\s*[/>]\s*/;

/** Combining marks, stripped after NFD so accents stop mattering. */
const COMBINING = /[̀-ͯ]/g;

/**
 * Header spellings, per role, already normalised.
 *
 * Both languages, because the table is read in both and a Brazilian user's file
 * says `Estado` where the English UI's own heading is `Cond`. Singular and
 * plural are listed rather than stemmed: a stemmer that gets `exemplares` right
 * also collapses words that should stay apart.
 */
const HEADERS: Record<ColumnRole, readonly string[]> = {
  name: ['nome', 'name', 'item', 'titulo', 'title'],
  group: ['grupo', 'group'],
  section: ['secao', 'section', 'divisoria'],
  year: ['ano', 'year'],
  copies: ['exemp', 'exemplar', 'exemplares', 'copies', 'copy', 'qtd', 'quantidade', 'quantity'],
  condition: ['estado', 'condicao', 'condition', 'cond'],
  value: ['valor', 'value'],
  tags: ['tags', 'tag', 'etiquetas', 'etiqueta'],
  description: ['descricao', 'description'],
};

/** Condition spellings, per wire value — the labels the badge prints, plus the enum. */
const CONDITION_WORDS: Record<Condition, readonly string[]> = {
  Mint: ['mint', 'perfeito', 'perfeita', 'novo', 'nova'],
  Good: ['good', 'bom', 'boa'],
  Fair: ['fair', 'razoavel', 'regular'],
};

/** Cells that mean "on the wantlist", i.e. no copies at all. */
const WANTED_WORDS = ['quero', 'wanted', 'wishlist', 'desejo'];

/**
 * Cells that mean "nothing here".
 *
 * The em dash leads because it is what the table prints for an absent value,
 * and the single most likely way for this format to be produced is a copy of
 * that table.
 */
const BLANK_WORDS = ['—', '–', '-', 'n/a', 'na', 'null'];

/**
 * Case-, accent- and trailing-punctuation-insensitive. `Exemp.` and
 * `exemplares` are the same header; so are `Seção` and `secao`, which is what a
 * file that lost its encoding on the way through a mail client looks like.
 */
function normalize(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(COMBINING, '')
    .toLowerCase()
    .replace(/[.\s]+$/g, '')
    .trim();
}

/** Whether a cell is one of the ways this format spells emptiness. */
function isBlank(raw: string): boolean {
  const value = normalize(raw);
  return !value || BLANK_WORDS.includes(value);
}

/** Names compare the way a person reads them: trimmed, folded, accent-blind. */
function nameKey(raw: string): string {
  return normalize(raw).replace(/\s+/g, ' ');
}

// --- header ----------------------------------------------------------------

/**
 * The header row, resolved.
 *
 * A repeated header is *ignored* rather than refused, and only the first of the
 * pair keeps its meaning: two `Valor` columns is a spreadsheet someone widened
 * carelessly, not a file to reject, and taking the first is the only choice
 * that does not depend on which one they meant.
 */
export function resolveColumns(header: readonly string[]): ResolvedColumn[] {
  const taken = new Set<string>();
  return header.map((raw, index) => {
    const key = normalize(raw);
    const role = (Object.keys(HEADERS) as ColumnRole[]).find(candidate =>
      HEADERS[candidate].includes(key),
    );
    const identity = role ?? `field:${key}`;
    if (!key || taken.has(identity)) {
      return { index, header: raw.trim(), role: 'ignored' as const };
    }
    taken.add(identity);
    return role
      ? { index, header: raw.trim(), role }
      : { index, header: raw.trim(), role: 'field' as const, field: raw.trim() };
  });
}

// --- cells -----------------------------------------------------------------

/**
 * How many copies an `Estado` cell implies on its own, and of what condition.
 *
 * The table prints `Perfeito x2` (with a multiplication sign), so that is legal
 * input and the count is a count — which is what makes a copy of the rendered
 * table round-trip without the user having to also copy the `Exemp.` column. An
 * explicit `Exemp.` value always wins over it: the number in the column the
 * user filled in is the number they meant.
 */
interface ConditionCell {
  condition: Condition | null;
  count: number | null;
  /** False for a word this format has no meaning for — an error, not a guess. */
  known: boolean;
}

function readCondition(raw: string): ConditionCell {
  const trimmed = raw.trim();
  if (isBlank(trimmed)) return { condition: null, count: null, known: true };

  const match = /^(.*?)\s*[×x*]\s*(\d+)$/i.exec(trimmed);
  const word = normalize(match ? match[1] : trimmed);
  const count = match ? Number(match[2]) : null;

  if (WANTED_WORDS.includes(word)) return { condition: null, count: 0, known: true };

  const condition = CONDITIONS.find(candidate => CONDITION_WORDS[candidate].includes(word));
  return condition
    ? { condition, count, known: true }
    : { condition: null, count: null, known: false };
}

/**
 * A whole, non-negative count, or null when the cell says nothing usable.
 *
 * The digit test is not redundant with the parse. `parseAmount` answers `0` for
 * anything with no digit in it, which is right for an *amount* — the table
 * prints a dash for nothing and nothing is zero — and wrong for a count, where
 * it would read `dois` as "no copies" and quietly empty somebody's shelf
 * instead of saying it could not read the word.
 */
function readCount(raw: string): number | null {
  if (isBlank(raw) || !/\d/.test(raw)) return null;
  const parsed = parseAmount(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
}

/** Tags as a person writes a list of them: commas, semicolons or pipes. */
function readTags(raw: string): string[] {
  return raw
    .split(/[,;|]/)
    .map(tag => tag.trim())
    .filter(Boolean);
}

// --- group resolution ------------------------------------------------------

interface GroupResolution {
  id: string;
  created: boolean;
  error?: CsvImportIssue['key'];
}

/**
 * A destination group for one `Grupo` cell, creating what is missing.
 *
 * Three spellings resolve, in this order, and the order is the point:
 *
 * 1. **The open group's own name**, which resolves to the open group. Standing
 *    in Ouro and pasting a table whose every row says Ouro means those rows
 *    belong to Ouro — not to a new Ouro nested inside it.
 * 2. **A path** — `Cavaleiros / Ouro` — walked from the scope, creating each
 *    missing link. This is the unambiguous spelling and the one the template
 *    hands out for a nested collection.
 * 3. **A bare name that already exists exactly once** anywhere inside the
 *    scope's subtree. This is what makes the common file work: a user who has
 *    already built their tree writes `Cavaleiros de Ouro` and it lands in the
 *    group of that name, wherever they filed it.
 * 4. **Anything else** — created as a direct child of the scope.
 *
 * The one thing rule 1 costs: a descendant that shares its ancestor's name is
 * not addressable by a bare name from inside that ancestor. Import it from the
 * level above, where `Ouro / Ouro` separates the two.
 *
 * A bare name matching **more than one** group is the case with no defensible
 * answer, so it is an issue rather than a guess: filing forty items into the
 * wrong "Series 1" is not something the user would find out about.
 */
function resolveGroup(
  groups: GroupNode[],
  scopeId: string,
  raw: string,
  create: (name: string, parentId: string | null) => GroupNode,
): GroupResolution {
  const parts = raw.trim().split(PATH_SEPARATOR).filter(Boolean);
  if (!parts.length) return { id: scopeId, created: false };

  if (parts.length === 1) {
    const key = nameKey(parts[0]);

    // The open group answers to its own name, and wins outright.
    //
    // The obvious rule is the opposite one — a group cannot be found "inside"
    // itself — and it is wrong for the gesture this whole feature exists to
    // serve: the user opens a group, copies the table in front of them, and
    // that table's `Grupo` column says the name of the group they are standing
    // in, on every row. Excluding the scope turned each of those rows into a
    // sub-group of the same name nested inside its twin, silently.
    //
    // It wins rather than being one candidate among the descendants, because a
    // group that shares its parent's name would otherwise make the parent's own
    // name ambiguous — and "which Ouro did you mean" is not a question to ask
    // someone who is *looking at* the answer. The cost is stated in the doc
    // comment: from inside a group, a same-named descendant is not addressable
    // by a bare name; run that import from the level above, where the path
    // spelling separates them.
    const scope = groupById(groups, scopeId);
    if (scope && nameKey(scope.name) === key) return { id: scope.id, created: false };

    const inScope = new Set(scopeId ? subtreeIds(groups, scopeId).slice(1) : groups.map(g => g.id));
    const matches = groups.filter(g => inScope.has(g.id) && nameKey(g.name) === key);
    if (matches.length === 1) return { id: matches[0].id, created: false };
    if (matches.length > 1) {
      return { id: scopeId, created: false, error: 'csvImport.error.ambiguousGroup' };
    }
  }

  let parentId: string | null = scopeId || null;
  let created = false;
  for (const part of parts) {
    const key = nameKey(part);
    const existing = childrenOf(groups, parentId).find(g => nameKey(g.name) === key);
    if (existing) {
      parentId = existing.id;
      continue;
    }
    const node = create(part, parentId);
    groups.push(node);
    parentId = node.id;
    created = true;
  }
  return { id: parentId ?? '', created };
}

// --- planning --------------------------------------------------------------

let groupSeq = 0;
let itemSeq = 0;

/** Ids in the shape the rest of the app mints them, unique within a tick. */
function newGroupId(): string {
  return `g${Date.now().toString(36)}${(groupSeq++).toString(36)}`;
}

function newItemId(): string {
  return `i${Date.now().toString(36)}${(itemSeq++).toString(36)}`;
}

/** The breadcrumb spelling of a destination, for the preview. */
function pathLabel(groups: readonly GroupNode[], id: string, rootLabel: string): string {
  if (!id) return rootLabel;
  const path = pathOf([...groups], id);
  return path.length ? path.map(node => node.name).join(' / ') : rootLabel;
}

/**
 * The copies a row ends up holding, reusing the ones the item already has.
 *
 * An update that simply rebuilt the list would throw away every price paid,
 * acquisition date and note on the item — data the CSV never carried and
 * therefore never meant to replace. Extra copies are dropped from the **end**,
 * which is the only removal order a file that says "two" rather than "these
 * two" can justify.
 */
function reconcileCopies(
  existing: readonly ItemCopy[],
  count: number,
  condition: Condition | null,
): ItemCopy[] {
  const copies: ItemCopy[] = [];
  for (let i = 0; i < count; i++) {
    const base = existing[i] ?? newCopy();
    copies.push(condition ? { ...base, condition } : { ...base });
  }
  return copies;
}

/**
 * Custom values merged onto an item: named fields replace, the rest survive.
 *
 * The same rule the bulk bar applies (rule 14) and for the same reason — a
 * column the file does not carry is not a column the file is clearing.
 */
function mergeCustom(
  existing: readonly CustomFieldValue[],
  incoming: ReadonlyMap<string, string>,
): CustomFieldValue[] {
  const out = existing
    .filter(field => {
      const replacement = incoming.get(field.key);
      return replacement === undefined || replacement.trim() !== '';
    })
    .map(field => {
      const replacement = incoming.get(field.key);
      return replacement === undefined ? field : { key: field.key, value: replacement.trim() };
    });

  const known = new Set(out.map(field => field.key));
  for (const [key, value] of incoming) {
    if (known.has(key) || !value.trim()) continue;
    out.push({ key, value: value.trim() });
  }
  return out;
}

/**
 * The type to declare a new custom column as, read off its own values.
 *
 * Every non-empty value in the column has to agree, and `text` is the answer
 * whenever they do not — a column of years with one `?` in it is text, and
 * declaring it `number` would make that row's value unsortable and its input a
 * spinner it cannot hold. The type only drives the item form and the ordering
 * (rule 4); the values themselves stay strings either way, so a wrong guess
 * costs a retype of the declaration and never any data.
 */
function inferFieldType(values: readonly string[]): GroupFieldType {
  const filled = values.map(value => value.trim()).filter(Boolean);
  if (!filled.length) return 'text';
  if (filled.every(value => /^\d{4}-\d{2}-\d{2}$/.test(value))) return 'date';
  if (filled.every(value => /^-?\d+([.,]\d+)?$/.test(value))) return 'number';
  return 'text';
}

const EMPTY_PLAN: CsvImportPlan = {
  columns: [],
  rows: [],
  issues: [],
  newGroups: [],
  newFields: [],
  created: 0,
  updated: 0,
  skipped: 0,
};

/**
 * What importing `text` into `collection` would do.
 *
 * Nothing here mutates the collection — the group tree is cloned before a row
 * is allowed to add to it, so a plan that is computed and thrown away (every
 * keystroke in the paste box computes one) leaves nothing behind.
 *
 * `rootLabel` is the collection's own name, used only to spell the destination
 * of an unfiled row in the preview. It is passed in rather than translated here
 * for the same reason the issues carry keys.
 */
export function planCsvImport(
  text: string,
  collection: Collection,
  options: CsvImportOptions,
  rootLabel: string,
): CsvImportPlan {
  if (!text.trim()) return EMPTY_PLAN;

  const records = parseCsv(text, detectDelimiter(text));
  if (!records.length) return EMPTY_PLAN;

  const [header, ...body] = records;
  const columns = resolveColumns(header.cells);

  const by = (role: ColumnRole) => columns.find(column => column.role === role);
  const nameColumn = by('name');
  if (!nameColumn) {
    return {
      ...EMPTY_PLAN,
      columns,
      issues: [{ line: header.line, key: 'csvImport.error.noNameColumn' }],
    };
  }
  if (body.length > MAX_IMPORT_ROWS) {
    return {
      ...EMPTY_PLAN,
      columns,
      issues: [{ line: 0, key: 'csvImport.error.tooManyRows', params: { max: MAX_IMPORT_ROWS } }],
    };
  }

  // The working tree: a clone, so `resolveGroup` may append to it freely and two
  // rows naming the same missing group share the one it creates.
  const groups = collection.groups.map(node => ({ ...node }));
  const existingIds = new Set(groups.map(node => node.id));

  const groupColumn = by('group');
  const yearColumn = by('year');
  const valueColumn = by('value');
  const copiesColumn = by('copies');
  const conditionColumn = by('condition');
  const sectionColumn = by('section');
  const tagsColumn = by('tags');
  const descriptionColumn = by('description');
  // A column naming a field somebody declared *per copy* is refused rather than
  // imported. The item table has one row per item, so it carries one value where
  // that field has one per exemplar — and the name is the field's identity, so
  // writing the value to `item.custom` instead would not be a near miss: it
  // would put data under a name nothing reads, on the screen that shows the
  // copies. Refused collection-wide, not per destination, because a name that
  // means "per copy" in one group cannot quietly mean "per item" in the next.
  const copyScopedNames = new Set(
    [collection.fields, ...collection.groups.map(group => group.fields)]
      .flat()
      .filter(field => field.scope === 'copy')
      .map(field => field.name),
  );
  const declaredColumns = columns.filter(column => column.role === 'field');
  const fieldColumns = declaredColumns.filter(column => !copyScopedNames.has(column.field!));

  // Name → the item that answers to it, per group, so a duplicate is one lookup
  // rather than a scan per row. Rows planned in this run join it, so a file
  // listing the same figure twice treats the second as a duplicate of the
  // first exactly as it would of a stored one.
  const byName = new Map<string, Item>();
  for (const item of collection.items) {
    byName.set(`${item.groupId} ${nameKey(item.name)}`, item);
  }

  const issues: CsvImportIssue[] = [];
  // On the header line, because that is where the mistake is: the column is
  // wrong for every row at once, and one issue per row would bury the rest.
  for (const column of declaredColumns.filter(c => copyScopedNames.has(c.field!))) {
    issues.push({
      line: header.line,
      key: 'csvImport.error.copyScopedColumn',
      params: { name: column.field! },
    });
  }
  const rows: PlannedRow[] = [];
  const fieldValues = new Map<string, string[]>();
  const thisYear = new Date().getFullYear();

  for (const record of body) {
    const cell = (column: ResolvedColumn | undefined) =>
      column ? (record.cells[column.index] ?? '') : '';

    const name = cell(nameColumn).trim();
    if (!name) {
      // A row with no name is the one thing no guess can repair, and it is also
      // what a line of stray delimiters looks like.
      issues.push({ line: record.line, key: 'csvImport.error.noName' });
      continue;
    }

    const groupCell = cell(groupColumn);
    const resolved = resolveGroup(groups, options.scopeId, groupCell, (label, parentId) => ({
      id: newGroupId(),
      name: label,
      parentId,
      fields: [],
      sort: null,
      target: null,
    }));
    if (resolved.error) {
      issues.push({ line: record.line, key: resolved.error, params: { name: groupCell.trim() } });
      continue;
    }
    const groupId = resolved.id;

    const condition = readCondition(cell(conditionColumn));
    if (conditionColumn && !condition.known) {
      issues.push({
        line: record.line,
        key: 'csvImport.error.condition',
        params: { value: cell(conditionColumn).trim() },
      });
      continue;
    }

    const declared = copiesColumn ? readCount(cell(copiesColumn)) : null;
    if (copiesColumn && declared === null && !isBlank(cell(copiesColumn))) {
      issues.push({
        line: record.line,
        key: 'csvImport.error.copies',
        params: { value: cell(copiesColumn).trim() },
      });
      continue;
    }

    const key = `${groupId} ${nameKey(name)}`;
    const existing = byName.get(key);
    if (existing && options.duplicates === 'skip') {
      rows.push({
        line: record.line,
        outcome: 'skip',
        item: existing,
        groupPath: pathLabel(groups, groupId, rootLabel),
        newGroup: resolved.created,
      });
      continue;
    }

    // An absent column means "leave alone" on an update and "use the default"
    // on a create — the same rule the bulk bar follows, for the same reason:
    // the file did not mention it, so the file has no opinion about it.
    const base: Item = existing ?? {
      id: newItemId(),
      name,
      description: '',
      year: thisYear,
      value: 0,
      groupId,
      sectionId: '',
      tags: [],
      img: '',
      custom: [],
      copies: [],
      photoIds: [],
    };

    const item: Item = { ...base, name, groupId };

    // Blank is ignored rather than cleared, exactly as the bulk bar ignores it:
    // `Item.year` is a non-nullable number with no way to spell "unknown", so a
    // clear would have to invent a `0` and print it in a column.
    if (yearColumn && !isBlank(cell(yearColumn))) {
      item.year = Math.round(parseAmount(cell(yearColumn)));
    }
    // `value` does clear, because `0` is precisely what "not estimated" means
    // (rule 3) — and the table spells it with the same dash this reads as zero.
    if (valueColumn) {
      item.value = parseAmount(cell(valueColumn));
    }
    if (descriptionColumn) {
      item.description = cell(descriptionColumn).trim();
    }

    // A stated count wins over the count the badge prints, and the badge's own
    // count wins over the absence of a column. With neither, a stated condition
    // means one copy and a wantlist word means none.
    const count = declared ?? condition.count ?? (condition.condition ? 1 : 0);
    if (count > MAX_COPIES_PER_ROW) {
      issues.push({
        line: record.line,
        key: 'csvImport.error.tooManyCopies',
        params: { max: MAX_COPIES_PER_ROW },
      });
      continue;
    }
    if (copiesColumn || conditionColumn) {
      item.copies = reconcileCopies(base.copies, count, condition.condition);
    }

    if (sectionColumn) {
      item.sectionId = matchSection(collection.sections, groupId, cell(sectionColumn));
    } else if (existing && existing.groupId !== groupId) {
      // Moving an item leaves its old divider pointing at another group's run —
      // legal on the wire, invisible on screen, and a dangling id once saved.
      item.sectionId = '';
    }

    if (tagsColumn) {
      // Through the shared rules, not re-implemented: two ideas of what a tag
      // is eventually disagree about duplicates, casing and the reserved one.
      let tags: readonly string[] = item.tags;
      for (const tag of readTags(cell(tagsColumn))) tags = withTagAdded(tags, tag);
      item.tags = [...tags];
    }

    if (fieldColumns.length) {
      const incoming = new Map<string, string>();
      for (const column of fieldColumns) {
        const value = cell(column);
        incoming.set(column.field!, value);
        const bucket = fieldValues.get(column.field!) ?? [];
        bucket.push(value);
        fieldValues.set(column.field!, bucket);
      }
      item.custom = mergeCustom(base.custom, incoming);
    }

    const planned = syncWantedTag(item);
    byName.set(key, planned);
    rows.push({
      line: record.line,
      outcome: existing ? 'update' : 'create',
      item: planned,
      groupPath: pathLabel(groups, groupId, rootLabel),
      newGroup: resolved.created,
    });
  }

  const newGroups = groups.filter(node => !existingIds.has(node.id));

  // Every row landing in a group that does not exist yet is marked, not merely
  // the row that happened to create it. `resolved.created` answers "did this
  // line add a node", which is a fact about the parse; what the preview is
  // asked is "is this destination new", and a reader scanning two rows of the
  // same new group would otherwise see the mark on one of them and read it as
  // arbitrary.
  const fresh = new Set(newGroups.map(node => node.id));
  for (const row of rows) row.newGroup = fresh.has(row.item.groupId);

  return {
    columns,
    rows,
    issues,
    newGroups,
    newFields: planFields(collection.fields, groups, rows, fieldColumns, fieldValues, options.scopeId),
    created: rows.filter(row => row.outcome === 'create').length,
    updated: rows.filter(row => row.outcome === 'update').length,
    skipped: rows.filter(row => row.outcome === 'skip').length,
  };
}

/**
 * An existing divider of this group, by name. Never creates one.
 *
 * A section's identity is its **position** (rule 5) — the array order of
 * `collection.sections` is what makes Bronze then Prata then Ouro a
 * progression — and a file has no way to say where a new one goes. So an
 * unrecognised name reads as "no section", exactly as a dangling id does,
 * rather than inventing a divider at whichever end of the list an append
 * happened to reach.
 */
function matchSection(sections: readonly Section[], groupId: string, raw: string): string {
  if (isBlank(raw)) return '';
  const key = nameKey(raw);
  return sectionsOf([...sections], groupId).find(section => nameKey(section.name) === key)?.id ?? '';
}

/**
 * Where each custom column has to be declared for its values to be visible.
 *
 * Values live on the item and a group merely declares what to *show* (rule 4),
 * so an undeclared column would import perfectly and appear nowhere — the worse
 * of the two failures, because nothing on screen would say the data is there.
 *
 * A field the collection declares for the whole of itself counts as declared
 * everywhere, so a column matching one is imported and nothing is added.
 *
 * The declaration goes on the **scope group** when the import is scoped to one:
 * `fieldsFor` merges down the ancestor path, so one declaration covers every
 * destination inside it and forty sibling groups do not each grow a copy of the
 * same field. At the collection root there is no such group — fields exist only
 * on groups — so it falls back to declaring per destination, and a row landing
 * in the unfiled bucket gets no declaration at all because there is nothing
 * there to hold one.
 */
function planFields(
  collectionFields: readonly GroupField[],
  groups: readonly GroupNode[],
  rows: readonly PlannedRow[],
  fieldColumns: readonly ResolvedColumn[],
  values: ReadonlyMap<string, string[]>,
  scopeId: string,
): { groupId: string; field: GroupField }[] {
  if (!fieldColumns.length) return [];

  const targets = scopeId
    ? [scopeId]
    : [
        ...new Set(rows.filter(row => row.outcome !== 'skip').map(row => row.item.groupId)),
      ].filter(Boolean);

  const tree = [...groups];
  const out: { groupId: string; field: GroupField }[] = [];
  for (const groupId of targets) {
    const declared = new Set(
      fieldsFor({ fields: [...collectionFields], groups: tree }, groupId).map(f => f.name),
    );
    for (const column of fieldColumns) {
      const name = column.field!;
      if (declared.has(name)) continue;
      declared.add(name);
      // Item scope: the file is the item table, and a column of it describes
      // the item. A copy-scoped column never reaches here — it was refused at
      // the header — so this is not a guess, it is the only thing it can be.
      out.push({
        groupId,
        field: { name, type: inferFieldType(values.get(name) ?? []), scope: 'item' },
      });
    }
  }
  return out;
}

/**
 * The collection as the plan would leave it — the payload of one full-document
 * PUT (rule 14), never N item writes.
 *
 * Updated items keep their **position** in `collection.items`: that array order
 * is the manual ordering a user arranged by hand (rule 4), and re-importing a
 * corrected sheet is not a request to reshuffle the group. New items append, in
 * file order, which is the only order the file states.
 */
export function applyCsvImport(collection: Collection, plan: CsvImportPlan): Collection {
  const written = new Map<string, Item>();
  for (const row of plan.rows) {
    if (row.outcome !== 'skip') written.set(row.item.id, row.item);
  }

  const groups = [...collection.groups.map(node => ({ ...node })), ...plan.newGroups];
  for (const { groupId, field } of plan.newFields) {
    const target = groups.find(node => node.id === groupId);
    // A declaration whose group is gone is dropped rather than recreated: the
    // plan is a snapshot, and the collection may have moved under it.
    if (target) target.fields = [...target.fields, field];
  }

  const known = new Set(collection.items.map(item => item.id));
  const items = collection.items.map(item => written.get(item.id) ?? item);
  for (const row of plan.rows) {
    if (row.outcome === 'create' && !known.has(row.item.id)) items.push(row.item);
  }

  return { ...collection, groups, items };
}

/**
 * The template's single row: the header, in the language the user is reading,
 * followed by the custom fields the open group declares.
 *
 * Built from the same catalogue the table's own headings come from, so the two
 * cannot drift — a column renamed on screen renames itself in the template, and
 * the file the user gets back is one the parser recognises by construction.
 *
 * **No example rows.** A template that ships with two plausible-looking items in
 * it is a template somebody imports without deleting them, and "Example item"
 * then sits in their collection looking exactly like something they catalogued.
 * The worked example belongs on screen, where it cannot be submitted — it is the
 * paste box's own placeholder.
 */
export function templateCsv(
  t: (key: MessageKey) => string,
  fields: readonly GroupField[],
): string[][] {
  return [
    [
      t('itemList.name'),
      t('itemList.group'),
      t('itemList.year'),
      t('itemList.copies'),
      t('itemList.condition'),
      t('itemList.value'),
      ...fields.map(field => field.name),
    ],
  ];
}
