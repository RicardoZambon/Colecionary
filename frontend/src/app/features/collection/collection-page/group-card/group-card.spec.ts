import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { GroupCard } from './group-card';
import { I18nService } from '../../../../core/i18n';
import { VaultStore } from '../../../../core/state/vault.store';
import { GroupStats } from '../../../../core/utils/group-stats.util';

/**
 * Number agreement, on the surface that reported it.
 *
 * The card is the screen a user found saying "1 subgrupos", so the regression
 * lives here rather than only against the dictionary: a correct pair still reads
 * wrong if the template stops calling `plural`.
 */
@Component({
  imports: [GroupCard],
  template: `<app-group-card
    collectionId="c1"
    groupId="g1"
    name="Sailor Moon"
    [stats]="stats"
    [tiles]="[]"
  />`,
})
class HostComponent {
  stats: GroupStats = statsWith({});
}

function statsWith(patch: Partial<GroupStats>): GroupStats {
  return {
    groupId: 'g1',
    catalogued: 1,
    owned: 1,
    copies: 1,
    target: null,
    hasTarget: false,
    denominator: 1,
    pct: 100,
    cataloguedPct: 100,
    missing: 0,
    wanted: 0,
    uncatalogued: 0,
    over: 0,
    value: 0,
    childCount: 0,
    coverPhotoIds: [],
    ...patch,
  };
}

/** Only `currencyFor` is reached from this card. */
const storeStub = { currencyFor: () => 'USD' as const };

function mount(stats: GroupStats, lang: 'en' | 'pt-BR') {
  TestBed.inject(I18nService).apply(lang);
  const fixture = TestBed.createComponent(HostComponent);
  fixture.componentInstance.stats = stats;
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return {
    subs: el.querySelector('.card__subs')?.textContent?.trim(),
    missing: el.querySelector('.card__missing .warn')?.textContent?.trim(),
    sentence: el.querySelector('.card__sentence')?.textContent?.trim(),
    aria: el.querySelector('a')?.getAttribute('aria-label') ?? '',
  };
}

describe('GroupCard number agreement', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: VaultStore, useValue: storeStub }],
    });
  });

  it('says "1 sub-group", not "1 sub-groups"', () => {
    expect(mount(statsWith({ childCount: 1 }), 'en').subs).toBe('1 sub-group');
    expect(mount(statsWith({ childCount: 3 }), 'en').subs).toBe('3 sub-groups');
  });

  /** The reported bug, in the language that reported it. */
  it('says "1 subgrupo" in Portuguese', () => {
    expect(mount(statsWith({ childCount: 1 }), 'pt-BR').subs).toBe('1 subgrupo');
    expect(mount(statsWith({ childCount: 3 }), 'pt-BR').subs).toBe('3 subgrupos');
  });

  it('conjugates the missing count in Portuguese', () => {
    const one = statsWith({ catalogued: 2, owned: 1, missing: 1, wanted: 1, denominator: 2 });
    const many = statsWith({ catalogued: 4, owned: 1, missing: 3, wanted: 3, denominator: 4 });
    expect(mount(one, 'pt-BR').missing).toBe('falta 1');
    expect(mount(many, 'pt-BR').missing).toBe('faltam 3');
  });

  it('inflects "catalogado" in the progress sentence', () => {
    expect(mount(statsWith({ catalogued: 1, owned: 1 }), 'pt-BR').sentence).toBe(
      '1 na coleção de 1 catalogado',
    );
    expect(
      mount(statsWith({ catalogued: 4, owned: 1, denominator: 4, missing: 3, wanted: 3 }), 'pt-BR')
        .sentence,
    ).toBe('1 na coleção de 4 catalogados');
  });

  /** The aria-label speaks the same phrases the card prints, so it agrees too. */
  it('carries the agreeing phrases into the aria-label', () => {
    const aria = mount(
      statsWith({ catalogued: 2, owned: 1, missing: 1, wanted: 1, denominator: 2, childCount: 1 }),
      'pt-BR',
    ).aria;
    expect(aria).toContain('falta 1');
    expect(aria).toContain('1 subgrupo');
    expect(aria).not.toContain('1 subgrupos');
  });
});
