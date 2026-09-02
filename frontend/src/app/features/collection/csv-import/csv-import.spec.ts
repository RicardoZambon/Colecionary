import { describe, expect, it } from 'vitest';

import { Collection, GroupNode, Item, Section } from '../../../core/models';
import {
  CsvImportOptions,
  MAX_COPIES_PER_ROW,
  MAX_IMPORT_ROWS,
  applyCsvImport,
  planCsvImport,
  resolveColumns,
} from './csv-import';

const ROOT = 'Cavaleiros';

function group(id: string, name: string, parentId: string | null = null): GroupNode {
  return { id, name, parentId, fields: [], sort: null, target: null };
}

function item(id: string, name: string, groupId: string, over: Partial<Item> = {}): Item {
  return {
    id,
    name,
    description: '',
    year: 2006,
    value: 0,
    groupId,
    sectionId: '',
    tags: [],
    img: '',
    custom: [],
    copies: [],
    photoIds: [],
    ...over,
  };
}

function collection(over: Partial<Collection> = {}): Collection {
  return {
    id: 'c1',
    name: ROOT,
    description: '',
    groups: [],
    sections: [],
    items: [],
    members: [],
    linkShare: false,
    ...over,
  };
}

function plan(text: string, coll = collection(), options: Partial<CsvImportOptions> = {}) {
  return planCsvImport(text, coll, { scopeId: '', duplicates: 'skip', ...options }, ROOT);
}

describe('resolveColumns', () => {
  it('recognises the table’s own headings, in either language', () => {
    expect(
      resolveColumns(['Nome', 'Grupo', 'Ano', 'Exemp.', 'Estado', 'Valor']).map(c => c.role),
    ).toEqual(['name', 'group', 'year', 'copies', 'condition', 'value']);
    expect(
      resolveColumns(['Name', 'Group', 'Year', 'Copies', 'Cond', 'Value']).map(c => c.role),
    ).toEqual(['name', 'group', 'year', 'copies', 'condition', 'value']);
  });

  it('is blind to case, accents and a trailing dot', () => {
    expect(resolveColumns(['NOME', 'seção', 'exemp']).map(c => c.role)).toEqual([
      'name',
      'section',
      'copies',
    ]);
  });

  it('treats anything else as a custom field, keeping the typed spelling', () => {
    const [column] = resolveColumns(['Nº de catálogo']);
    expect(column.role).toBe('field');
    expect(column.field).toBe('Nº de catálogo');
  });

  it('ignores a repeated header rather than refusing the file', () => {
    expect(resolveColumns(['Nome', 'Valor', 'Valor']).map(c => c.role)).toEqual([
      'name',
      'value',
      'ignored',
    ]);
  });

  it('ignores an empty header cell', () => {
    expect(resolveColumns(['Nome', '  ']).map(c => c.role)).toEqual(['name', 'ignored']);
  });
});

describe('planCsvImport — the file from the ask', () => {
  const csv = [
    'Nome;Grupo;Ano;Exemp.;Estado;Valor',
    'Seiya Pegaso;Cavaleiros de Bronze (V1);2006;0;Quero;—',
    'Shiryu Dragon;Cavaleiros de Bronze (V1);2006;0;Quero;—',
    'Mu Aries;Cavaleiros de Ouro;2006;0;Quero;—',
    'Aldebaran Tauro;Cavaleiros de Ouro;2006;0;Quero;—',
  ].join('\n');

  it('creates every row and the two groups they name', () => {
    const result = plan(csv);
    expect(result.created).toBe(4);
    expect(result.issues).toEqual([]);
    expect(result.newGroups.map(g => g.name)).toEqual([
      'Cavaleiros de Bronze (V1)',
      'Cavaleiros de Ouro',
    ]);
  });

  it('reads "Quero" as a wantlist row and the dash as no value', () => {
    const [first] = plan(csv).rows;
    expect(first.item.copies).toEqual([]);
    expect(first.item.value).toBe(0);
    expect(first.item.year).toBe(2006);
    expect(first.item.tags).toContain('wanted');
  });

  it('files the two rows of one group into the same created group', () => {
    const result = plan(csv);
    const gold = result.rows.filter(row => row.item.name.endsWith('Aries') || row.item.name.endsWith('Tauro'));
    expect(new Set(gold.map(row => row.item.groupId)).size).toBe(1);
    expect(gold[0].groupPath).toBe('Cavaleiros de Ouro');
  });

  it('applies to a collection that then holds exactly those items and groups', () => {
    const before = collection();
    const after = applyCsvImport(before, plan(csv, before));
    expect(after.items).toHaveLength(4);
    expect(after.groups).toHaveLength(2);
    expect(before.items).toHaveLength(0);
    expect(before.groups).toHaveLength(0);
  });
});

describe('planCsvImport — columns', () => {
  it('refuses a file with no name column, and says so once', () => {
    const result = plan('Grupo;Ano\nOuro;2006');
    expect(result.rows).toEqual([]);
    expect(result.issues).toEqual([{ line: 1, key: 'csvImport.error.noNameColumn' }]);
  });

  it('accepts a file of nothing but names', () => {
    const result = plan('Nome\nSeiya\nShiryu');
    expect(result.created).toBe(2);
    expect(result.rows[0].item.groupId).toBe('');
  });

  it('leaves an unnamed row out of the plan and reports its line', () => {
    const result = plan('Nome;Ano\nSeiya;2006\n;2006\nShiryu;2006');
    expect(result.created).toBe(2);
    expect(result.issues).toEqual([{ line: 3, key: 'csvImport.error.noName' }]);
  });

  it('defaults a missing year to this year, as the item form does', () => {
    const [row] = plan('Nome\nSeiya').rows;
    expect(row.item.year).toBe(new Date().getFullYear());
  });

  it('leaves the year alone when the cell is blank, rather than writing a zero', () => {
    const [row] = plan('Nome;Ano\nSeiya;—').rows;
    expect(row.item.year).toBe(new Date().getFullYear());
  });

  it('reads an amount in either locale, symbol and all', () => {
    const rows = plan('Nome;Valor\nA;R$ 1.234,57\nB;$1,234.57\nC;120').rows;
    expect(rows.map(row => row.item.value)).toEqual([1234.57, 1234.57, 120]);
  });

  it('reads tags through the shared rules and drops duplicates', () => {
    const [row] = plan('Nome;Tags\nSeiya;raro, japão , raro').rows;
    expect(row.item.tags.filter(tag => tag !== 'wanted')).toEqual(['raro', 'japão']);
  });

  it('carries a description when the file has one', () => {
    const [row] = plan('Nome;Descrição\nSeiya;Caixa lacrada').rows;
    expect(row.item.description).toBe('Caixa lacrada');
  });
});

describe('planCsvImport — copies and condition', () => {
  it('turns a count into that many copies of the stated condition', () => {
    const [row] = plan('Nome;Exemp.;Estado\nSeiya;3;Perfeito').rows;
    expect(row.item.copies).toHaveLength(3);
    expect(row.item.copies.every(copy => copy.condition === 'Mint')).toBe(true);
    expect(row.item.tags).not.toContain('wanted');
  });

  it('reads the count the badge itself prints', () => {
    const [row] = plan('Nome;Estado\nSeiya;Perfeito ×2').rows;
    expect(row.item.copies).toHaveLength(2);
    expect(row.item.copies[0].condition).toBe('Mint');
  });

  it('lets an explicit count win over the badge’s', () => {
    const [row] = plan('Nome;Exemp.;Estado\nSeiya;5;Perfeito ×2').rows;
    expect(row.item.copies).toHaveLength(5);
  });

  it('reads a bare condition as one copy', () => {
    const [row] = plan('Nome;Estado\nSeiya;Bom').rows;
    expect(row.item.copies).toHaveLength(1);
    expect(row.item.copies[0].condition).toBe('Good');
  });

  it('reports a condition it has no meaning for instead of guessing', () => {
    const result = plan('Nome;Estado\nSeiya;Amassadinho');
    expect(result.rows).toEqual([]);
    expect(result.issues).toEqual([
      { line: 2, key: 'csvImport.error.condition', params: { value: 'Amassadinho' } },
    ]);
  });

  it('reports an unreadable count', () => {
    const result = plan('Nome;Exemp.\nSeiya;dois');
    expect(result.issues).toEqual([
      { line: 2, key: 'csvImport.error.copies', params: { value: 'dois' } },
    ]);
  });

  it('refuses a count that would invent a shelf of objects', () => {
    const result = plan(`Nome;Exemp.\nSeiya;${MAX_COPIES_PER_ROW + 1}`);
    expect(result.rows).toEqual([]);
    expect(result.issues[0].key).toBe('csvImport.error.tooManyCopies');
  });

  it('leaves copies untouched when neither column is present', () => {
    const before = collection({ items: [item('i1', 'Seiya', '', { copies: [] })] });
    const [row] = plan('Nome;Ano\nSeiya;2010', before, { duplicates: 'update' }).rows;
    expect(row.item.copies).toEqual([]);
    expect(row.item.year).toBe(2010);
  });
});

describe('planCsvImport — groups', () => {
  const groups = [group('g1', 'Ouro'), group('g2', 'Bronze'), group('g3', 'V1', 'g2')];

  it('matches an existing group by name, wherever it sits in the tree', () => {
    const [row] = plan('Nome;Grupo\nSeiya;v1', collection({ groups })).rows;
    expect(row.item.groupId).toBe('g3');
    expect(row.newGroup).toBe(false);
  });

  it('walks a path and creates only the missing links', () => {
    const result = plan('Nome;Grupo\nSeiya;Bronze / V2', collection({ groups }));
    expect(result.newGroups).toHaveLength(1);
    expect(result.newGroups[0].parentId).toBe('g2');
    expect(result.rows[0].groupPath).toBe('Bronze / V2');
  });

  it('refuses to guess between two groups of the same name', () => {
    const ambiguous = [group('g1', 'Série 1'), group('g2', 'Prata'), group('g3', 'Série 1', 'g2')];
    const result = plan('Nome;Grupo\nSeiya;Série 1', collection({ groups: ambiguous }));
    expect(result.rows).toEqual([]);
    expect(result.issues).toEqual([
      { line: 2, key: 'csvImport.error.ambiguousGroup', params: { name: 'Série 1' } },
    ]);
  });

  it('resolves relative to the open group, so a blank cell means that group', () => {
    const result = plan('Nome;Grupo\nSeiya;\nShiryu;V1', collection({ groups }), {
      scopeId: 'g2',
    });
    expect(result.rows[0].item.groupId).toBe('g2');
    expect(result.rows[1].item.groupId).toBe('g3');
    expect(result.newGroups).toEqual([]);
  });

  it('creates a new group under the open one, not at the root', () => {
    const result = plan('Nome;Grupo\nSeiya;V2', collection({ groups }), { scopeId: 'g2' });
    expect(result.newGroups[0].parentId).toBe('g2');
  });

  it('spells an unfiled destination with the collection’s own name', () => {
    expect(plan('Nome\nSeiya').rows[0].groupPath).toBe(ROOT);
  });

  it('reads the open group’s own name as the open group, not as a twin inside it', () => {
    // The gesture this exists for: standing in Bronze, pasting the table you are
    // looking at, whose Grupo column says Bronze on every row.
    const result = plan('Nome;Grupo\nSeiya;Bronze', collection({ groups }), { scopeId: 'g2' });
    expect(result.rows[0].item.groupId).toBe('g2');
    expect(result.newGroups).toEqual([]);
  });

  it('lets the open group win over a descendant that shares its name', () => {
    const twins = [group('g1', 'Ouro'), group('g2', 'Ouro', 'g1')];
    const result = plan('Nome;Grupo\nSeiya;Ouro', collection({ groups: twins }), { scopeId: 'g1' });
    expect(result.rows[0].item.groupId).toBe('g1');
    expect(result.issues).toEqual([]);
  });

  it('separates the twins by path when the import runs from the level above', () => {
    const twins = [group('g1', 'Ouro'), group('g2', 'Ouro', 'g1')];
    const result = plan('Nome;Grupo\nSeiya;Ouro / Ouro', collection({ groups: twins }));
    expect(result.rows[0].item.groupId).toBe('g2');
    expect(result.newGroups).toEqual([]);
  });
});

describe('planCsvImport — duplicates', () => {
  const before = collection({
    groups: [group('g1', 'Ouro')],
    items: [item('i1', 'Mu Aries', 'g1', { value: 90, copies: [] })],
  });

  it('skips a name already in that group, and counts it', () => {
    const result = plan('Nome;Grupo;Valor\nMu Aries;Ouro;120', before);
    expect(result.skipped).toBe(1);
    expect(result.created).toBe(0);
    expect(applyCsvImport(before, result).items[0].value).toBe(90);
  });

  it('updates in place when asked, keeping the item’s id and position', () => {
    const result = plan('Nome;Grupo;Valor\nMu Aries;Ouro;120', before, { duplicates: 'update' });
    expect(result.updated).toBe(1);
    const after = applyCsvImport(before, result);
    expect(after.items).toHaveLength(1);
    expect(after.items[0].id).toBe('i1');
    expect(after.items[0].value).toBe(120);
  });

  it('keeps what an updating file does not mention', () => {
    const rich = collection({
      groups: [group('g1', 'Ouro')],
      items: [
        item('i1', 'Mu Aries', 'g1', {
          description: 'comprado em 2019',
          custom: [{ key: 'Nº', value: '07' }],
          photoIds: ['p1'],
        }),
      ],
    });
    const result = plan('Nome;Grupo;Valor\nMu Aries;Ouro;120', rich, { duplicates: 'update' });
    const [row] = result.rows;
    expect(row.item.description).toBe('comprado em 2019');
    expect(row.item.custom).toEqual([{ key: 'Nº', value: '07' }]);
    expect(row.item.photoIds).toEqual(['p1']);
  });

  it('reuses a copy rather than rebuilding it, so its price survives', () => {
    const owned = collection({
      groups: [group('g1', 'Ouro')],
      items: [
        item('i1', 'Mu Aries', 'g1', {
          copies: [
            { id: 'cp1', condition: 'Good', price: 45, value: null, acquiredOn: '2019-04-01', status: 'Keep', notes: 'da feira' },
          ],
        }),
      ],
    });
    const [row] = plan('Nome;Grupo;Exemp.;Estado\nMu Aries;Ouro;2;Perfeito', owned, {
      duplicates: 'update',
    }).rows;
    expect(row.item.copies).toHaveLength(2);
    expect(row.item.copies[0].id).toBe('cp1');
    expect(row.item.copies[0].price).toBe(45);
    expect(row.item.copies[0].notes).toBe('da feira');
    expect(row.item.copies[0].condition).toBe('Mint');
  });

  it('treats a name repeated inside one file as a duplicate of the first row', () => {
    const result = plan('Nome;Grupo\nMu Aries;Prata\nMu Aries;Prata');
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('does not confuse the same name in two different groups', () => {
    const result = plan('Nome;Grupo\nMu Aries;Prata\nMu Aries;Bronze');
    expect(result.created).toBe(2);
    expect(result.skipped).toBe(0);
  });
});

describe('planCsvImport — custom fields', () => {
  it('carries an unrecognised column onto the item and declares it', () => {
    const result = plan('Nome;Grupo;Nº\nSeiya;Bronze;01');
    expect(result.rows[0].item.custom).toEqual([{ key: 'Nº', value: '01' }]);
    expect(result.newFields).toHaveLength(1);
    expect(result.newFields[0].field).toEqual({ name: 'Nº', type: 'number' });
  });

  it('declares once on the open group rather than on every destination', () => {
    const groups = [group('g1', 'Bronze'), group('g2', 'V1', 'g1'), group('g3', 'V2', 'g1')];
    const result = plan('Nome;Grupo;Nº\nA;V1;01\nB;V2;02', collection({ groups }), {
      scopeId: 'g1',
    });
    expect(result.newFields).toEqual([{ groupId: 'g1', field: { name: 'Nº', type: 'number' } }]);
  });

  it('does not redeclare a field the group already inherits', () => {
    const parent = group('g1', 'Bronze');
    parent.fields = [{ name: 'Nº', type: 'text' }];
    const result = plan('Nome;Grupo;Nº\nA;V1;01', collection({ groups: [parent, group('g2', 'V1', 'g1')] }));
    expect(result.newFields).toEqual([]);
  });

  it('reads a column of dates as dates and a mixed one as text', () => {
    expect(plan('Nome;Lançamento\nA;2006-04-01\nB;2007-05-02').newFields[0]).toBeUndefined();
    const scoped = plan('Nome;Grupo;Lançamento\nA;Bronze;2006-04-01\nB;Bronze;2007-05-02');
    expect(scoped.newFields[0].field.type).toBe('date');
    const mixed = plan('Nome;Grupo;Lançamento\nA;Bronze;2006-04-01\nB;Bronze;?');
    expect(mixed.newFields[0].field.type).toBe('text');
  });

  it('keeps a custom value the file does not mention on an update', () => {
    const before = collection({
      groups: [group('g1', 'Ouro')],
      items: [item('i1', 'Mu', 'g1', { custom: [{ key: 'Nº', value: '07' }, { key: 'Escala', value: '1/8' }] })],
    });
    const [row] = plan('Nome;Grupo;Nº\nMu;Ouro;08', before, { duplicates: 'update' }).rows;
    expect(row.item.custom).toEqual([
      { key: 'Nº', value: '08' },
      { key: 'Escala', value: '1/8' },
    ]);
  });
});

describe('planCsvImport — sections', () => {
  const sections: Section[] = [{ id: 's1', groupId: 'g1', name: 'Bronze', target: null }];
  const coll = collection({ groups: [group('g1', 'Ouro')], sections });

  it('matches an existing divider of that group by name', () => {
    const [row] = plan('Nome;Grupo;Seção\nMu;Ouro;bronze', coll).rows;
    expect(row.item.sectionId).toBe('s1');
  });

  it('reads a divider it does not know as no divider, never inventing one', () => {
    const [row] = plan('Nome;Grupo;Seção\nMu;Ouro;Prata', coll).rows;
    expect(row.item.sectionId).toBe('');
  });

  it('clears a divider left behind when an update moves the item’s group', () => {
    const moving = collection({
      groups: [group('g1', 'Ouro'), group('g2', 'Prata')],
      sections,
      items: [item('i1', 'Mu', 'g1', { sectionId: 's1' })],
    });
    const [row] = plan('Nome;Grupo\nMu;Prata', moving, { duplicates: 'update' }).rows;
    expect(row.item.groupId).toBe('g2');
    expect(row.item.sectionId).toBe('');
  });
});

describe('planCsvImport — limits and edges', () => {
  it('refuses a file past the row ceiling, in one message', () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `Item ${i}`);
    const result = plan(['Nome', ...rows].join('\n'));
    expect(result.rows).toEqual([]);
    expect(result.issues[0].key).toBe('csvImport.error.tooManyRows');
  });

  it('reads an empty paste as an empty plan, not an error', () => {
    expect(plan('   ')).toMatchObject({ rows: [], issues: [], created: 0 });
  });

  it('reads a comma file as readily as a semicolon one', () => {
    expect(plan('Nome,Grupo,Ano\nSeiya,Bronze,2006').created).toBe(1);
  });

  it('survives a name holding the delimiter, when quoted', () => {
    const [row] = plan('Nome;Grupo\n"Seiya; Pégaso";Bronze').rows;
    expect(row.item.name).toBe('Seiya; Pégaso');
  });
});

describe('applyCsvImport', () => {
  it('leaves manual order alone: updates in place, creations at the end', () => {
    const before = collection({
      groups: [group('g1', 'Ouro')],
      items: [item('i1', 'A', 'g1'), item('i2', 'B', 'g1'), item('i3', 'C', 'g1')],
    });
    const result = plan('Nome;Grupo;Valor\nB;Ouro;50\nD;Ouro;60', before, {
      duplicates: 'update',
    });
    const after = applyCsvImport(before, result);
    expect(after.items.map(i => i.name)).toEqual(['A', 'B', 'C', 'D']);
    expect(after.items[1].value).toBe(50);
  });

  it('writes nothing for a plan of nothing but skips', () => {
    const before = collection({ groups: [group('g1', 'Ouro')], items: [item('i1', 'A', 'g1')] });
    const after = applyCsvImport(before, plan('Nome;Grupo\nA;Ouro', before));
    expect(after.items).toEqual(before.items);
    expect(after.groups).toEqual(before.groups);
  });

  it('declares the planned fields on the group that is to hold them', () => {
    const before = collection({ groups: [group('g1', 'Ouro')] });
    const after = applyCsvImport(before, plan('Nome;Grupo;Nº\nMu;Ouro;07', before));
    expect(after.groups.find(g => g.id === 'g1')!.fields).toEqual([{ name: 'Nº', type: 'number' }]);
    expect(before.groups[0].fields).toEqual([]);
  });

  it('keeps everything about the collection it was not asked to change', () => {
    const before = collection({ description: 'minha coleção', linkShare: true, currency: 'BRL' });
    const after = applyCsvImport(before, plan('Nome\nSeiya', before));
    expect(after.description).toBe('minha coleção');
    expect(after.linkShare).toBe(true);
    expect(after.currency).toBe('BRL');
  });
});

describe('planCsvImport — the new-group mark', () => {
  it('marks every row landing in a group that does not exist yet', () => {
    const result = plan('Nome;Grupo\nA;Prata\nB;Prata\nC;Prata');
    expect(result.rows.map(row => row.newGroup)).toEqual([true, true, true]);
    expect(result.newGroups).toHaveLength(1);
  });

  it('marks none of them when the group is already there', () => {
    const result = plan('Nome;Grupo\nA;Ouro\nB;Ouro', collection({ groups: [group('g1', 'Ouro')] }));
    expect(result.rows.map(row => row.newGroup)).toEqual([false, false]);
  });
});
