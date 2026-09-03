import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { I18nService } from '../../../core/i18n';
import { Collection, GroupNode, Item } from '../../../core/models';
import { CsvImportPlan } from './csv-import';
import { CsvImportDialog } from './csv-import-dialog';

/**
 * The dialog's contract with the page, and the one property the whole feature
 * rests on: **what the preview says is the object that gets emitted.**
 *
 * `csv-import.spec.ts` proves the reading. These are the questions it cannot
 * answer — whether the counts reach the screen, whether the button refuses an
 * import that would write nothing, and whether the plan handed to the page is
 * the plan that was drawn.
 */
function group(id: string, name: string, parentId: string | null = null): GroupNode {
  return { id, name, parentId, fields: [], sort: null, target: null };
}

function item(id: string, name: string, groupId: string): Item {
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
  };
}

const COLLECTION: Collection = {
  id: 'c1',
  name: 'Saint Seiya',
  description: '',
  fields: [],
  groups: [group('ouro', 'Cavaleiros de Ouro'), group('bronze', 'Cavaleiros de Bronze')],
  sections: [],
  items: [item('i1', 'Mu Aries', 'ouro')],
  members: [],
  linkShare: false,
  currency: null,
};

const CSV = [
  'Nome;Grupo;Ano;Exemp.;Estado;Valor',
  'Seiya Pegaso;Cavaleiros de Bronze;2006;0;Quero;—',
  'Mu Aries;Cavaleiros de Ouro;2006;1;Perfeito;120',
  'Shura Capricornio;Cavaleiros de Prata;2006;0;Quero;—',
].join('\n');

function mount(opts: { scopeId?: string; scopeName?: string; saving?: boolean } = {}) {
  TestBed.configureTestingModule({});
  TestBed.inject(I18nService).apply('en');

  const fixture = TestBed.createComponent(CsvImportDialog);
  fixture.componentRef.setInput('collection', COLLECTION);
  fixture.componentRef.setInput('scopeId', opts.scopeId ?? '');
  fixture.componentRef.setInput('scopeName', opts.scopeName ?? '');
  fixture.componentRef.setInput('saving', opts.saving ?? false);
  fixture.detectChanges();

  const el = fixture.nativeElement as HTMLElement;
  const text = (selector: string) => (el.querySelector(selector)?.textContent ?? '').trim();
  const all = (selector: string) =>
    [...el.querySelectorAll(selector)].map(node => (node.textContent ?? '').trim());

  const paste = (csv: string) => {
    const box = el.querySelector('textarea')!;
    box.value = csv;
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  const buttons = () => [...el.querySelectorAll<HTMLButtonElement>('button')];
  const confirm = () =>
    buttons().find(button => /^Import/.test((button.textContent ?? '').trim()))!;
  const chooseDuplicates = (mode: 'skip' | 'update') => {
    const radios = [...el.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    radios[mode === 'skip' ? 0 : 1].click();
    fixture.detectChanges();
  };

  const emitted: CsvImportPlan[] = [];
  fixture.componentInstance.confirmed.subscribe(plan => emitted.push(plan));

  return { fixture, el, text, all, paste, confirm, chooseDuplicates, emitted };
}

describe('CsvImportDialog', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('says nothing will happen until something is pasted, and refuses to import', () => {
    const page = mount();
    expect(page.text('.summary__quiet')).toContain('Paste your rows');
    expect(page.confirm().disabled).toBe(true);
  });

  it('counts what it would write, group creations included', () => {
    const page = mount();
    page.paste(CSV);
    const counts = page.all('.counts li');
    // Mu Aries is already in Ouro, so it is left alone; Prata does not exist.
    expect(counts).toContain('2 items added');
    expect(counts).toContain('1 already here, left alone');
    expect(counts).toContain('1 group created');
    expect(page.confirm().disabled).toBe(false);
    expect(page.confirm().textContent!.trim()).toBe('Import 2 items');
  });

  it('draws one preview row per line, saying where it lands and what happens', () => {
    const page = mount();
    page.paste(CSV);
    const rows = [...page.el.querySelectorAll('tbody tr')].map(row =>
      [...row.querySelectorAll('td')].map(cell => (cell.textContent ?? '').trim()),
    );
    expect(rows).toHaveLength(3);
    expect(rows[0][0]).toBe('2');
    expect(rows[0][1]).toBe('Seiya Pegaso');
    expect(rows[0][3]).toBe('Add');
    expect(rows[1][3]).toBe('Leave alone');
    expect(rows[2][2]).toContain('Cavaleiros de Prata');
    expect(rows[2][2]).toContain('new group');
  });

  it('emits exactly the plan it drew', () => {
    const page = mount();
    page.paste(CSV);
    page.confirm().click();

    expect(page.emitted).toHaveLength(1);
    const plan = page.emitted[0];
    expect(plan.created).toBe(2);
    expect(plan.skipped).toBe(1);
    expect(plan.newGroups.map(g => g.name)).toEqual(['Cavaleiros de Prata']);
    expect(plan.rows.map(row => row.item.name)).toEqual([
      'Seiya Pegaso',
      'Mu Aries',
      'Shura Capricornio',
    ]);
  });

  it('re-reads the file when the duplicate rule changes', () => {
    const page = mount();
    page.paste(CSV);
    page.chooseDuplicates('update');
    const counts = page.all('.counts li');
    expect(counts).toContain('1 item updated');
    expect(counts).not.toContain('1 already here, left alone');
    expect(page.confirm().textContent!.trim()).toBe('Import 3 items');
  });

  it('names the lines it could not read instead of dropping them in silence', () => {
    const page = mount();
    page.paste('Nome;Estado\nSeiya;Perfeito\nShiryu;Amassadinho');
    expect(page.text('.issues__heading')).toBe('1 line could not be read and will be left out');
    expect(page.all('.issues li')[0]).toContain('Line 3');
    expect(page.all('.issues li')[0]).toContain('Amassadinho');
    // The readable row still imports — one bad line does not refuse the file.
    expect(page.confirm().textContent!.trim()).toBe('Import 1 item');
  });

  it('refuses a file whose every row is already here, and says why', () => {
    const page = mount();
    page.paste('Nome;Grupo\nMu Aries;Cavaleiros de Ouro');
    expect(page.text('.summary__quiet')).toContain('already in the collection');
    expect(page.confirm().disabled).toBe(true);
  });

  it('reads a blank group cell as the open group when one is open', () => {
    const page = mount({ scopeId: 'bronze', scopeName: 'Cavaleiros de Bronze' });
    page.paste('Nome\nSeiya Pegaso');
    page.confirm().click();
    expect(page.emitted[0].rows[0].item.groupId).toBe('bronze');
    expect(page.text('.lede')).toContain('Cavaleiros de Bronze');
  });

  it('stops offering itself while the page’s write is in flight', () => {
    const page = mount({ saving: true });
    page.paste(CSV);
    expect(page.confirm().disabled).toBe(true);
    expect(page.confirm().textContent!.trim()).toBe('Importing…');
  });
});
