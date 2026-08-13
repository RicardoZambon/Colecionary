import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { UiChip } from './chip';

@Component({
  imports: [UiChip],
  template: `
    <ui-chip [link]="link" [queryParams]="queryParams" [selected]="selected" [count]="count">
      Revistas
    </ui-chip>
  `,
})
class HostComponent {
  link: unknown[] | null = null;
  queryParams: Record<string, string> | null = null;
  selected = false;
  count: string | number | null = null;
}

function mount(patch: Partial<HostComponent> = {}) {
  const fixture = TestBed.createComponent(HostComponent);
  Object.assign(fixture.componentInstance, patch);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return {
    anchor: el.querySelector('a'),
    button: el.querySelector('button'),
    chip: el.querySelector('.chip')!,
  };
}

describe('UiChip', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

  it('renders a button when it only filters', () => {
    const { button, anchor } = mount();
    expect(button).not.toBeNull();
    expect(anchor).toBeNull();
  });

  it.each([
    ['as a button', null],
    ['as a link', ['/c', 'comics'] as unknown[]],
  ])('projects its label %s', (_name, link) => {
    // Regression: two <ng-content> slots, one per branch, left every
    // navigating chip blank — the breadcrumb rendered as empty pills.
    expect(mount({ link }).chip.textContent?.trim()).toBe('Revistas');
  });

  it('renders a real anchor when it navigates', () => {
    // Regression guard: wrapping the button version in an <a> would nest a
    // button inside a link — invalid, and it kills middle-click and
    // open-in-new-tab, which a breadcrumb needs.
    const { anchor, button } = mount({ link: ['/c', 'comics'], queryParams: { g: 'Marvel' } });
    expect(anchor).not.toBeNull();
    expect(button).toBeNull();
    expect(anchor!.getAttribute('href')).toContain('/c/comics');
  });

  it('keeps the same visual state in both forms', () => {
    expect(mount({ selected: true }).chip.classList).toContain('chip--selected');
    expect(mount({ selected: true, link: ['/c', 'x'] }).chip.classList).toContain('chip--selected');
  });

  it('shows a count only when one is given', () => {
    expect(mount().chip.querySelector('.chip__count')).toBeNull();
    expect(mount({ count: 0 }).chip.querySelector('.chip__count')?.textContent?.trim()).toBe('0');
  });
});
