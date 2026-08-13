import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

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
    />
  `,
})
class HostComponent {
  path: GroupNode[] = [];
  children: ChildChip[] = [];
  collapsed = false;
  pending = false;
}

function mount(patch: Partial<HostComponent> = {}) {
  const fixture = TestBed.createComponent(HostComponent);
  Object.assign(fixture.componentInstance, patch);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;

  const labels = (selector: string) =>
    [...el.querySelectorAll(`${selector} .chip__label`)].map(n => n.textContent!.trim());

  return { el, path: () => labels('nav[aria-label="Group path"]'), children: () => labels('.children') };
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
    const { children, el } = mount({ path: [node('rev', 'Revistas')], children: SUBS });
    expect(children()).toEqual([]);
    expect(el.querySelector('.panel-toggle')).toBeNull();
  });

  it('shows no sub-group strip on a leaf', () => {
    expect(mount({ path: [node('mad', 'MAD')], collapsed: true }).children()).toEqual([]);
  });

  it('swaps the New pill for an input while a name is being typed', () => {
    expect(mount().el.querySelector('.chip-input')).toBeNull();
    expect(mount({ pending: true }).el.querySelector('.chip-input')).not.toBeNull();
  });
});
