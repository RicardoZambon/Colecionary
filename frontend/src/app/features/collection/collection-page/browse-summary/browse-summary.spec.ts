import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { BrowseSummary } from './browse-summary';
import { I18nService } from '../../../../core/i18n';

/**
 * The page's live region, and the one place a select-all is offered.
 *
 * Both facts it has to keep straight at once: the region must stay rendered
 * whatever the list is doing — a live region only announces changes inside one
 * already being observed, so dropping it would silence the very count it exists
 * to speak — while the control beside it must not offer an act that cannot
 * happen.
 */
function mount(inputs: {
  canEdit?: boolean;
  selectable?: boolean;
  countLabel?: string;
  filters?: { kind: 'condition' | 'own'; label: string }[];
}) {
  const fixture = TestBed.createComponent(BrowseSummary);
  fixture.componentRef.setInput('countLabel', inputs.countLabel ?? '0 of 9 items');
  fixture.componentRef.setInput('filters', inputs.filters ?? []);
  if (inputs.canEdit !== undefined) fixture.componentRef.setInput('canEdit', inputs.canEdit);
  if (inputs.selectable !== undefined) {
    fixture.componentRef.setInput('selectable', inputs.selectable);
  }
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return {
    el,
    pick: () => el.querySelector('.summary__pick'),
    region: () => el.querySelector('.summary__state[aria-live="polite"]'),
    count: () => el.querySelector('.summary__count')?.textContent?.trim(),
  };
}

describe('BrowseSummary — a select-all over nothing', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    TestBed.inject(I18nService).apply('en');
  });

  it('offers the box while there is something to select', () => {
    expect(mount({ selectable: true }).pick()).not.toBeNull();
  });

  /**
   * The reported state: a condition plus "Wanted" narrows a group to nothing,
   * and the summary read "0 of 9 items" beside a live, clickable box that did
   * not even change state when pressed — `allSelected` guards the empty list so
   * it never came back checked, and `setAll` over nothing is a no-op.
   */
  it('takes the box away when the filters matched nothing', () => {
    const summary = mount({ selectable: false });
    expect(summary.pick()).toBeNull();
    // …and keeps the region and the count, which is the half that must not go.
    expect(summary.region()).not.toBeNull();
    expect(summary.count()).toBe('0 of 9 items');
  });

  it('still answers to the role first', () => {
    // A reader is offered no selection whatever the list is doing.
    expect(mount({ canEdit: false, selectable: true }).pick()).toBeNull();
  });
});

describe('BrowseSummary — the remove mark is an icon', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    TestBed.inject(I18nService).apply('en');
  });

  /**
   * It was a text `×`, which resolves from whatever font happens to cover the
   * code point and matched neither the weight nor the optical alignment of the
   * identical control in the toast, the dialog and the upload rows. The three
   * glyphs the app keeps are vocabulary, not chrome: the copy count's
   * multiplier, "nothing here", and the approximation mark.
   */
  it('draws the chip mark with ui-icon rather than a Unicode glyph', () => {
    const summary = mount({ filters: [{ kind: 'condition', label: 'Condition: Mint' }] });
    const drop = summary.el.querySelector('.drop')!;
    expect(drop.querySelector('ui-icon svg')).not.toBeNull();
    // No stray glyph left behind: the chip's own text is the whole label.
    expect(drop.textContent).toBe('');
    expect(summary.el.textContent).not.toContain('×');
  });

  it('leaves the mark out of the accessible name, which the chip already carries', () => {
    const summary = mount({ filters: [{ kind: 'own', label: 'Status: Owned' }] });
    const chip = summary.el.querySelector('ui-chip button')!;
    expect(chip.getAttribute('aria-label')).toBe(
      TestBed.inject(I18nService).t('browse.filter.remove', { label: 'Status: Owned' }),
    );
    expect(summary.el.querySelector('.drop ui-icon')!.getAttribute('aria-hidden')).toBe('true');
  });
});
