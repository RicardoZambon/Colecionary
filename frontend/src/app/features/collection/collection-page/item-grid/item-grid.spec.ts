import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { ItemGrid } from './item-grid';
import { I18nService } from '../../../../core/i18n';
import { Item } from '../../../../core/models';
import { VaultStore } from '../../../../core/state/vault.store';
import { chunkBySection } from '../../../../core/utils/sections.util';

/** Only `currencyFor` is reached from the grid. */
const storeStub = { currencyFor: () => 'USD' as const };

function item(id: string, patch: Partial<Item> = {}): Item {
  return {
    id,
    name: id,
    description: '',
    year: 1994,
    value: 0,
    groupId: 'sega',
    sectionId: '',
    tags: [],
    img: '',
    custom: [],
    copies: [
      {
        id: `${id}-c1`,
        condition: 'Good',
        price: 85,
        value: null,
        acquiredOn: null,
        status: 'Keep',
        notes: '',
        custom: [],
      },
    ],
    photoIds: [],
    ...patch,
  };
}

function mount(items: Item[]) {
  const fixture = TestBed.createComponent(ItemGrid);
  fixture.componentRef.setInput('items', items);
  fixture.componentRef.setInput('chunks', chunkBySection(items, []));
  fixture.componentRef.setInput('collectionId', 'c1');
  fixture.componentRef.setInput('groupNames', new Map([['sega', 'Sega']]));
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('ItemGrid — the selection box is a real target', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: VaultStore, useValue: storeStub },
      ],
    });
    TestBed.inject(I18nService).apply('en');
  });

  /**
   * `ui-checkbox` grows its 44px target with a pseudo-element on its own host,
   * and a pseudo-element's hit test resolves to the element that owns it — the
   * host, which is not the control. So a press landing anywhere but on the 15px
   * input reached a `<ui-checkbox>` with no handler and did nothing at all: the
   * `data-tap-ok` on that input claimed an exemption the styling never
   * delivered. Implicit label association is what makes the box a press of the
   * input, and it is the reason this element is a `<label>`. The other half —
   * that `ui-card` is `overflow: hidden`, so a target centred 8px from two
   * edges is clipped to ~30px — is in `item-grid.scss` and only a browser can
   * measure it.
   */
  it('wraps the box in a label the input belongs to', () => {
    const el = mount([item('saturn')]);
    const pick = el.querySelector('.item-card__pick')!;
    expect(pick.tagName).toBe('LABEL');
    const input = pick.querySelector('input[type="checkbox"]');
    expect(input).not.toBeNull();
    // Implicit association, which is what a `for`-less label buys: the control
    // has to be a descendant.
    expect(pick.contains(input!)).toBe(true);
  });

  it('offers no box at all to a reader', () => {
    const fixture = TestBed.createComponent(ItemGrid);
    fixture.componentRef.setInput('items', [item('saturn')]);
    fixture.componentRef.setInput('chunks', chunkBySection([item('saturn')], []));
    fixture.componentRef.setInput('collectionId', 'c1');
    fixture.componentRef.setInput('groupNames', new Map());
    fixture.componentRef.setInput('canEdit', false);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.item-card__pick')).toBeNull();
  });
});

describe('ItemGrid — the hint on a derived value', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: VaultStore, useValue: storeStub },
      ],
    });
    TestBed.inject(I18nService).apply('en');
  });

  /**
   * The sentence that explains the `≈` — nobody estimated this, so we are
   * showing what you paid — was unreachable in this view, because the stretched
   * link's `inset: 0` cover paints over every statically positioned descendant
   * whatever the DOM order. Whether it is on top now is a geometry question only
   * a browser can answer; what this pins is that the hint is on the element
   * `item-grid.scss` lifts, and nowhere else.
   */
  it('puts the hint on the value itself, which is the element the cover is lifted off', () => {
    const el = mount([item('saturn')]);
    const value = el.querySelector('.item-card__value')!;
    expect(value.getAttribute('title')).toBe(
      TestBed.inject(I18nService).t('value.fromPaidHint'),
    );
  });

  it('says nothing where the value is a real estimate', () => {
    const el = mount([item('saturn', { value: 120 })]);
    expect(el.querySelector('.item-card__value')!.getAttribute('title')).toBeNull();
  });
});
