import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { MosaicTile, UiMosaic } from './mosaic';

@Component({
  imports: [UiMosaic],
  template: `<ui-mosaic [tiles]="tiles" [placeholder]="placeholder" [dim]="dim" />`,
})
class HostComponent {
  tiles: MosaicTile[] = [];
  placeholder = 'No photos yet';
  dim = false;
}

function tile(n: number): MosaicTile {
  return { src: `/api/images/p${n}`, position: `${n}% 50%` };
}

function mount(patch: Partial<HostComponent> = {}) {
  const fixture = TestBed.createComponent(HostComponent);
  Object.assign(fixture.componentInstance, patch);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return {
    host: el.querySelector('ui-mosaic')!,
    tiles: [...el.querySelectorAll('.tile')] as HTMLElement[],
    empty: el.querySelector('.empty'),
    grid: el.querySelector('.grid'),
  };
}

describe('UiMosaic', () => {
  it('falls back to the placeholder with no tiles', () => {
    const { empty, tiles } = mount();
    expect(tiles).toHaveLength(0);
    expect(empty?.textContent?.trim()).toBe('No photos yet');
  });

  it.each([1, 2, 3, 4])('renders %i tiles and marks the layout', count => {
    const { tiles, grid } = mount({ tiles: Array.from({ length: count }, (_, i) => tile(i)) });
    expect(tiles).toHaveLength(count);
    expect(grid?.getAttribute('data-count')).toBe(String(count));
  });

  it('caps at four — a fifth photo would be too small to recognise', () => {
    expect(mount({ tiles: [1, 2, 3, 4, 5].map(tile) }).tiles).toHaveLength(4);
  });

  it('applies each tile its own framing', () => {
    const { tiles } = mount({ tiles: [tile(1), tile(2)] });
    expect(tiles[0].style.backgroundPosition).toBe('1% 50%');
    expect(tiles[1].style.backgroundPosition).toBe('2% 50%');
    expect(tiles[0].style.backgroundImage).toContain('/api/images/p1');
  });

  it('is decorative — the accessible name belongs to whatever wraps it', () => {
    expect(mount({ tiles: [tile(1)] }).host.getAttribute('aria-hidden')).toBe('true');
  });

  it('marks an unowned cover so it reads as a wantlist group', () => {
    expect(mount({ tiles: [tile(1)], dim: true }).host.classList).toContain('dim');
    expect(mount({ tiles: [tile(1)] }).host.classList).not.toContain('dim');
  });
});
