import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ICON_NAMES, IconName, UiIcon } from './icon';

@Component({
  imports: [UiIcon],
  template: `<ui-icon [name]="name()" [size]="size()" [label]="label()" />`,
})
class HostComponent {
  readonly name = signal<IconName>('home');
  readonly size = signal(16);
  readonly label = signal<string | null>(null);
}

function mount(patch: { name?: IconName; size?: number; label?: string | null } = {}) {
  const fixture = TestBed.createComponent(HostComponent);
  const host = fixture.componentInstance;
  if (patch.name !== undefined) host.name.set(patch.name);
  if (patch.size !== undefined) host.size.set(patch.size);
  if (patch.label !== undefined) host.label.set(patch.label);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, host, root: el.querySelector('ui-icon')!, svg: el.querySelector('svg')! };
}

describe('UiIcon', () => {
  it.each(ICON_NAMES)('draws something for "%s"', name => {
    // A mistyped @case renders an empty <svg> and nothing complains — the icon
    // just vanishes at whichever call site asked for it. This is the only thing
    // standing between a typo and an invisible control.
    const { svg } = mount({ name });
    expect(svg.children.length, `--${name} drew no geometry`).toBeGreaterThan(0);
  });

  it('names no icon twice', () => {
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
  });

  it('is hidden from assistive tech unless it is given a name', () => {
    // The default is correct for the common case: an icon beside its own label.
    // Announcing it there would read the same thing twice.
    const bare = mount();
    expect(bare.root.getAttribute('aria-hidden')).toBe('true');
    expect(bare.root.getAttribute('role')).toBeNull();
    expect(bare.root.getAttribute('aria-label')).toBeNull();
  });

  it('becomes a named image when the glyph is the whole meaning', () => {
    const named = mount({ label: 'Remove photo' });
    expect(named.root.getAttribute('role')).toBe('img');
    expect(named.root.getAttribute('aria-label')).toBe('Remove photo');
    expect(named.root.getAttribute('aria-hidden')).toBeNull();
  });

  it('keeps the inner svg hidden even when the host is named', () => {
    // Otherwise the svg element itself can surface as a second, nameless node.
    expect(mount({ label: 'Close' }).svg.getAttribute('aria-hidden')).toBe('true');
  });

  it('follows a label that arrives later', () => {
    const { fixture, host, root } = mount();
    host.label.set('Sort');
    fixture.detectChanges();
    expect(root.getAttribute('role')).toBe('img');
    expect(root.getAttribute('aria-hidden')).toBeNull();
  });

  it('renders square, at the asked-for size', () => {
    const { svg } = mount({ size: 28 });
    expect(svg.getAttribute('width')).toBe('28');
    expect(svg.getAttribute('height')).toBe('28');
  });

  it('fills the marks that are solid and strokes the rest', () => {
    expect(mount({ name: 'diamond' }).svg.getAttribute('fill')).toBe('currentColor');
    expect(mount({ name: 'diamond' }).svg.getAttribute('stroke')).toBe('none');
    expect(mount({ name: 'search' }).svg.getAttribute('fill')).toBe('none');
    expect(mount({ name: 'search' }).svg.getAttribute('stroke')).toBe('currentColor');
  });

  it('is never focusable — it is decoration or a name, never a control', () => {
    expect(mount().svg.getAttribute('focusable')).toBe('false');
  });
});
