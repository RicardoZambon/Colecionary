import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { I18nService } from '../../../../core/i18n';
import { GroupNode } from '../../../../core/models';
import { ChildChip, GroupBreadcrumb } from './group-breadcrumb';

function node(id: string, name: string, parentId: string | null = null): GroupNode {
  return { id, name, parentId, fields: [], sort: null, target: null };
}

@Component({
  imports: [GroupBreadcrumb],
  template: `
    <app-group-breadcrumb
      collectionId="comics"
      collectionName="Comics"
      [path]="path"
      [children]="children"
      [collapsed]="collapsed"
      [pending]="pending"
      [canEdit]="canEdit"
    />
  `,
})
class HostComponent {
  path: GroupNode[] = [];
  children: ChildChip[] = [];
  collapsed = false;
  pending = false;
  canEdit = true;
}

function mount(patch: Partial<HostComponent> = {}) {
  // The nav is selected by its translated aria-label, so pin the language.
  TestBed.inject(I18nService).apply('en');
  const fixture = TestBed.createComponent(HostComponent);
  Object.assign(fixture.componentInstance, patch);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;

  const labels = (selector: string) =>
    [...el.querySelectorAll(`${selector} .chip__label`)].map(n => n.textContent!.trim());

  return {
    el,
    path: () => labels('nav[aria-label="Group path"]'),
    children: () => labels('.children'),
    // `dashed` is a signal input, so it is not an attribute in the DOM; the
    // pill is identified by its label instead.
    newChip: () =>
      [...el.querySelectorAll('ui-chip')].find(c => (c.textContent ?? '').includes('+ New')) ?? null,
    manageLink: () => el.querySelector('a.manage'),
    nameInput: () => el.querySelector('ui-inline-edit'),
    panelToggle: () => el.querySelector('.panel-toggle'),
  };
}

describe('GroupBreadcrumb', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

  it('names every segment', () => {
    // Regression: the chips rendered as blank pills because ui-chip had a
    // projection slot per branch and the navigating one came up empty.
    const { path } = mount({ path: [node('rev', 'Revistas'), node('mad', 'MAD', 'rev')] });
    expect(path()).toEqual(['Comics', 'Revistas', 'MAD']);
  });

  it('starts at the collection when no group is open', () => {
    expect(mount().path()).toEqual(['Comics']);
  });

  it('marks the last segment as the current page', () => {
    const { el } = mount({ path: [node('rev', 'Revistas')] });
    const current = el.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain('Revistas');
  });

  const SUBS: ChildChip[] = [
    { id: 'mad', name: 'MAD', count: '3/30' },
    { id: 'turma', name: 'Turma', count: '5/20' },
  ];

  it('stands in for the panel while it is hidden', () => {
    // One strip, not two rows: where you are, then where you can go.
    const { children, el } = mount({
      path: [node('rev', 'Revistas')],
      children: SUBS,
      collapsed: true,
    });
    expect(children()).toEqual(['MAD', 'Turma']);
    expect(el.querySelector('.panel-toggle')).not.toBeNull();
  });

  it('leaves the sub-groups to the panel when it is open', () => {
    // Repeating them one hop shallower is what made this read as two controls.
    const { children } = mount({ path: [node('rev', 'Revistas')], children: SUBS });
    expect(children()).toEqual([]);
  });

  it('keeps one disclosure in both states, and says which one it is in', () => {
    // The panel's own chevron and this pill used to be mutually exclusive
    // branches, so pressing either destroyed the button that had just been
    // pressed and focus fell to the top of the document — in both directions.
    const open = mount({ path: [node('rev', 'Revistas')] });
    expect(open.panelToggle()).not.toBeNull();
    expect(open.panelToggle()!.getAttribute('aria-expanded')).toBe('true');
    // Named only while the panel it names is actually in the document.
    expect(open.panelToggle()!.getAttribute('aria-controls')).toBe('group-panel');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const shut = mount({ path: [node('rev', 'Revistas')], collapsed: true });
    expect(shut.panelToggle()).not.toBeNull();
    expect(shut.panelToggle()!.getAttribute('aria-expanded')).toBe('false');
    expect(shut.panelToggle()!.getAttribute('aria-controls')).toBeNull();
  });

  it('shows no sub-group strip on a leaf', () => {
    expect(mount({ path: [node('mad', 'MAD')], collapsed: true }).children()).toEqual([]);
  });

  it('swaps the New pill for a composer while a name is being typed', () => {
    // ui-inline-edit, not a hand-rolled input: it takes the caret on reveal,
    // which is the half the old box got wrong — `autofocus` does nothing to
    // content inserted after load.
    expect(mount().el.querySelector('ui-inline-edit')).toBeNull();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    expect(mount({ pending: true }).el.querySelector('ui-inline-edit')).not.toBeNull();
  });
});

describe('GroupBreadcrumb — view-only access', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('offers the write actions to someone who can write', () => {
    const page = mount({ path: [node('marvel', 'Marvel')] });

    expect(page.newChip()).not.toBeNull();
    expect(page.manageLink()).not.toBeNull();
  });

  it('offers a reader neither the New pill nor the Edit groups link', () => {
    // The settings route is refused by `canEditGuard` anyway, so the link would
    // bounce straight back — and creating a group would earn a 403. Offering an
    // action and then refusing it is the worst order to find out.
    const page = mount({ path: [node('marvel', 'Marvel')], canEdit: false });

    expect(page.newChip()).toBeNull();
    expect(page.manageLink()).toBeNull();
    // The path itself is reading, and stays — collection chip included.
    expect(page.path()).toEqual(['Comics', 'Marvel']);
  });

  it('does not open the name input for a reader, even if asked to', () => {
    // `pending` is the page's state, not a permission; the gate has to hold
    // regardless of what it says.
    const page = mount({ path: [node('marvel', 'Marvel')], pending: true, canEdit: false });

    expect(page.nameInput()).toBeNull();
  });
});
