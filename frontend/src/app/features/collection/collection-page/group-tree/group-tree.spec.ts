import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { GroupNode } from '../../../../core/models';
import { GroupStats, statsIndex } from '../../../../core/utils/group-stats.util';
import { GroupTree } from './group-tree';

function node(id: string, parentId: string | null = null): GroupNode {
  return { id, name: id, parentId, fields: [], sort: null, target: null };
}

const GROUPS = [
  node('bonecos'),
  node('starwars', 'bonecos'),
  node('marvel', 'bonecos'),
  node('revistas'),
];

@Component({
  imports: [GroupTree],
  template: `
    <app-group-tree
      collectionId="c1"
      [groups]="groups"
      [stats]="stats"
      [selectedId]="selectedId"
      [expanded]="expanded()"
      (expandedChange)="expanded.set($event)"
    />
  `,
})
class HostComponent {
  groups = GROUPS;
  stats: ReadonlyMap<string, GroupStats> = statsIndex(GROUPS, []);
  selectedId: string | null = null;
  expanded = signal<ReadonlySet<string>>(new Set<string>());
}

function mount(patch: Partial<Pick<HostComponent, 'selectedId'>> = {}) {
  const fixture = TestBed.createComponent(HostComponent);
  Object.assign(fixture.componentInstance, patch);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;

  const read = () => ({
    items: [...el.querySelectorAll('[role="treeitem"]')] as HTMLElement[],
    links: [...el.querySelectorAll('.row__link')] as HTMLElement[],
  });

  const press = (index: number, key: string) => {
    read().links[index].dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    fixture.detectChanges();
  };

  const names = () =>
    [...el.querySelectorAll('.row__name')].map(span => span.textContent!.trim());

  return { fixture, host: fixture.componentInstance, read, press, names, el };
}

describe('GroupTree', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

  it('shows only the roots until something is expanded', () => {
    const { names } = mount();
    expect(names()).toEqual(['bonecos', 'revistas']);
  });

  it('states each row’s depth for assistive tech', () => {
    const { read, press } = mount();
    press(0, 'ArrowRight'); // expand bonecos
    expect(read().items.map(li => li.getAttribute('aria-level'))).toEqual(['1', '2', '2', '1']);
  });

  it('keeps exactly one row tabbable', () => {
    // A hundred groups must not become a hundred tab stops.
    const { read, press } = mount();
    press(0, 'ArrowRight');
    expect(read().links.filter(a => a.getAttribute('tabindex') === '0')).toHaveLength(1);
  });

  it('puts the tab stop on the selected group', () => {
    const { read } = mount({ selectedId: 'revistas' });
    expect(read().links[1].getAttribute('tabindex')).toBe('0');
    expect(read().links[0].getAttribute('tabindex')).toBe('-1');
  });

  it('moves down and up across visible rows only', () => {
    const { read, press } = mount();

    press(0, 'ArrowDown');
    // bonecos is collapsed, so the next visible row is revistas, not a child.
    expect(document.activeElement).toBe(read().links[1]);

    press(1, 'ArrowUp');
    expect(document.activeElement).toBe(read().links[0]);
  });

  it('expands first, then descends, on ArrowRight', () => {
    const { host, read, press } = mount();

    press(0, 'ArrowRight');
    expect(host.expanded().has('bonecos')).toBe(true);

    press(0, 'ArrowRight');
    expect(document.activeElement).toBe(read().links[1]); // starwars
  });

  it('collapses first, then climbs, on ArrowLeft', () => {
    const { host, read, press } = mount();
    press(0, 'ArrowRight');

    press(1, 'ArrowLeft'); // on a leaf: climb to the parent
    expect(document.activeElement).toBe(read().links[0]);

    press(0, 'ArrowLeft'); // on an expanded parent: fold it
    expect(host.expanded().has('bonecos')).toBe(false);
  });

  it('jumps to the ends with Home and End', () => {
    const { read, press } = mount();
    press(0, 'End');
    expect(document.activeElement).toBe(read().links[read().links.length - 1]);

    press(read().links.length - 1, 'Home');
    expect(document.activeElement).toBe(read().links[0]);
  });

  it('marks the selected row for assistive tech', () => {
    const { read } = mount({ selectedId: 'revistas' });
    expect(read().items.map(li => li.getAttribute('aria-selected'))).toEqual(['false', 'true']);
  });

  it('reports expandability only for rows that have children', () => {
    const { read } = mount();
    expect(read().items.map(li => li.getAttribute('aria-expanded'))).toEqual(['false', null]);
  });

  it('toggles from the disclosure without following the row', () => {
    const { host, el, fixture } = mount();
    const twisty = el.querySelector('.row__twisty') as HTMLButtonElement;

    twisty.click();
    fixture.detectChanges();
    expect(host.expanded().has('bonecos')).toBe(true);
  });

  it('navigates with real anchors, so middle-click and new tabs work', () => {
    const { read } = mount();
    expect(read().links.every(a => a.tagName === 'A')).toBe(true);
    expect(read().links[0].getAttribute('href')).toContain('/c/c1');
  });
});
