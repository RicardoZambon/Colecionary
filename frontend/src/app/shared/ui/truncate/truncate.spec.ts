import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { UiTruncate } from './truncate';

const PATH = 'Bonecos ▸ Diecast ▸ 1987–1991 ▸ Original Bandai';

@Component({
  imports: [UiTruncate],
  template: `<ui-truncate [text]="text()" [lines]="lines()" />`,
})
class Host {
  readonly text = signal(PATH);
  readonly lines = signal(1);
}

describe('UiTruncate', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<Host>>;

  function host() {
    return fixture.nativeElement.querySelector('ui-truncate') as HTMLElement;
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
  });

  it('renders the whole string, so nothing is lost to the layout', () => {
    expect(host().textContent).toBe(PATH);
  });

  it('always carries the full text as its tooltip — the two cannot separate', () => {
    expect(host().getAttribute('title')).toBe(PATH);
  });

  it('keeps the tooltip in step when the text changes', () => {
    fixture.componentInstance.text.set('Espanha');
    fixture.detectChanges();

    expect(host().getAttribute('title')).toBe('Espanha');
  });

  it('clamps to the asked-for number of lines', () => {
    expect(host().classList.contains('clamp')).toBe(false);

    fixture.componentInstance.lines.set(2);
    fixture.detectChanges();

    expect(host().classList.contains('clamp')).toBe(true);
    expect(host().style.getPropertyValue('-webkit-line-clamp')).toBe('2');
  });
});
