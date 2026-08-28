import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { UiLightbox } from './lightbox';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiLightbox],
  template: `<ui-lightbox [ids]="ids()" subject="Chrono Trigger" [(index)]="index" [(open)]="open" />`,
})
class HostComponent {
  readonly ids = signal(['a', 'b', 'c']);
  readonly index = signal(0);
  readonly open = signal(true);
}

function mount() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return {
    fixture,
    host: fixture.componentInstance,
    el: fixture.nativeElement as HTMLElement,
  };
}

function press(key: string): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

describe('UiLightbox', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('shows the display rendition and links the original', () => {
    const { el } = mount();

    // Big, but not the multi-megabyte original — that is a deliberate click.
    expect((el.querySelector('.picture') as HTMLImageElement).src).toContain('size=display');
    expect((el.querySelector('.original') as HTMLAnchorElement).href).toContain('size=full');
  });

  it('pages with the arrow keys and wraps around', () => {
    const { fixture, host } = mount();

    press('ArrowRight');
    fixture.detectChanges();
    expect(host.index()).toBe(1);

    host.index.set(2);
    fixture.detectChanges();
    press('ArrowRight');
    fixture.detectChanges();
    expect(host.index()).toBe(0);

    press('ArrowLeft');
    fixture.detectChanges();
    expect(host.index()).toBe(2);
  });

  it('closes on Escape', () => {
    const { fixture, host } = mount();

    press('Escape');
    fixture.detectChanges();

    expect(host.open()).toBe(false);
  });

  it('reports its position', () => {
    const { el } = mount();
    expect(el.querySelector('.counter')?.textContent?.trim()).toBe('1 / 3');
  });

  it('disables paging for a single photo', () => {
    const { fixture, host, el } = mount();
    host.ids.set(['only']);
    fixture.detectChanges();

    const [previous, next] = el.querySelectorAll('.controls button');
    expect((previous as HTMLButtonElement).disabled).toBe(true);
    expect((next as HTMLButtonElement).disabled).toBe(true);
  });

  it('ignores keys once it is closed', () => {
    const { fixture, host } = mount();
    host.open.set(false);
    fixture.detectChanges();

    press('ArrowRight');
    fixture.detectChanges();

    // The page behind it uses the arrows to walk between items.
    expect(host.index()).toBe(0);
  });

  it('restores page scrolling when it closes', () => {
    const { fixture, host } = mount();
    expect(document.body.style.overflow).toBe('hidden');

    host.open.set(false);
    fixture.detectChanges();

    expect(document.body.style.overflow).not.toBe('hidden');
  });
});
