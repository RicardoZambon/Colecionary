import { describe, expect, it } from 'vitest';

import { detectDelimiter, parseCsv, toCsv } from './csv.util';

describe('detectDelimiter', () => {
  it('reads the header, not the body', () => {
    expect(detectDelimiter('Nome;Grupo;Ano\nA,B,C,D,E,F')).toBe(';');
  });

  it('ignores separators inside a quoted header cell', () => {
    expect(detectDelimiter('Nome;"Ano, mês";Valor')).toBe(';');
  });

  it('falls back to the template separator when the header has none', () => {
    expect(detectDelimiter('Nome')).toBe(';');
  });

  it('recognises a comma file', () => {
    expect(detectDelimiter('Nome,Grupo,Ano')).toBe(',');
  });
});

describe('parseCsv', () => {
  it('splits rows and cells', () => {
    expect(parseCsv('a;b\nc;d')).toEqual([
      { line: 1, cells: ['a', 'b'] },
      { line: 2, cells: ['c', 'd'] },
    ]);
  });

  it('drops blank lines but keeps the line numbers of what follows', () => {
    expect(parseCsv('a;b\n\n\nc;d')).toEqual([
      { line: 1, cells: ['a', 'b'] },
      { line: 4, cells: ['c', 'd'] },
    ]);
  });

  it('keeps a row that is only delimiters — somebody cleared it', () => {
    expect(parseCsv('a;b\n;;')).toEqual([
      { line: 1, cells: ['a', 'b'] },
      { line: 2, cells: ['', '', ''] },
    ]);
  });

  it('survives CRLF and a trailing newline', () => {
    expect(parseCsv('a;b\r\nc;d\r\n')).toEqual([
      { line: 1, cells: ['a', 'b'] },
      { line: 2, cells: ['c', 'd'] },
    ]);
  });

  it('strips the BOM Excel writes, so the first header still matches', () => {
    expect(parseCsv('﻿Nome;Grupo')).toEqual([{ line: 1, cells: ['Nome', 'Grupo'] }]);
  });

  it('passes a delimiter, a newline and a doubled quote through a quoted cell', () => {
    expect(parseCsv('"a;b";"line\nbreak";"say ""hi"""')).toEqual([
      { line: 1, cells: ['a;b', 'line\nbreak', 'say "hi"'] },
    ]);
  });

  it('counts the lines a quoted cell spans, so the next row reports the right one', () => {
    expect(parseCsv('"one\ntwo";x\nnext;y')).toEqual([
      { line: 1, cells: ['one\ntwo', 'x'] },
      { line: 3, cells: ['next', 'y'] },
    ]);
  });

  it('keeps a row whose single cell was deliberately emptied', () => {
    expect(parseCsv('""')).toEqual([{ line: 1, cells: [''] }]);
  });

  it('runs an unterminated quote to the end rather than throwing', () => {
    expect(parseCsv('a;"b\nc')).toEqual([{ line: 1, cells: ['a', 'b\nc'] }]);
  });
});

describe('toCsv', () => {
  it('quotes only what needs it', () => {
    expect(toCsv([['Nome', 'Grupo'], ['Seiya; Pégaso', 'Bronze']])).toBe(
      'Nome;Grupo\r\n"Seiya; Pégaso";Bronze',
    );
  });

  it('doubles an embedded quote', () => {
    expect(toCsv([['say "hi"']])).toBe('"say ""hi"""');
  });

  it('round-trips through the parser', () => {
    const rows = [
      ['Nome', 'Grupo'],
      ['A;B', 'line\nbreak'],
    ];
    expect(parseCsv(toCsv(rows)).map(row => row.cells)).toEqual(rows);
  });
});
