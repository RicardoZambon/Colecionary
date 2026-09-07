import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { I18nService } from '../../../core/i18n';
import { UiImageSlot } from './image-slot';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiImageSlot],
  template: `
    <ui-image-slot
      [src]="src()"
      [fillable]="fillable()"
      [placeholder]="'Banner'"
      (fileSelected)="picked.set($event.name)"
    />
  `,
})
class HostComponent {
  readonly src = signal<string | null>(null);
  readonly fillable = signal(true);
  readonly picked = signal<string | null>(null);
}

function mount() {
  TestBed.configureTestingModule({ providers: [] });
  TestBed.inject(I18nService).apply('en');
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

/**
 * The slot used to put its click handler, its drop handlers and its tooltip on
 * the `<ui-image-slot>` host — a custom element with `display: block`, no
 * `tabindex`, no `role`, no accessible name and no key handler. So Tab never
 * landed on a collection's banner or its icon, there was no way at all to open
 * the picker without a mouse, and the only cue that either was editable was a
 * tooltip that required hovering.
 */
describe('UiImageSlot', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('exposes a focusable, named button when the slot can be filled', () => {
    const { el } = mount();
    const button = el.querySelector<HTMLButtonElement>('button.surface');

    expect(button).not.toBeNull();
    expect(button!.type).toBe('button');
    button!.focus();
    expect(document.activeElement).toBe(button);
  });

  it('names the act, and renames it once the slot holds a picture', () => {
    const { fixture, host, el } = mount();
    const i18n = TestBed.inject(I18nService);
    const label = () => el.querySelector('button.surface')!.getAttribute('aria-label');

    expect(label()).toBe(i18n.t('ui.imageSlot.add'));

    host.src.set('/api/images/x?size=display');
    fixture.detectChanges();
    expect(label()).toBe(i18n.t('ui.imageSlot.replace'));
  });

  it('offers nothing to press when the slot is read-only', () => {
    // A Viewer's banner is a picture, not a control: the whole slot was a click
    // target and a drop zone, so a reader tapping it got a file dialog for an
    // upload the server answers with a 403.
    const { fixture, host, el } = mount();
    host.fillable.set(false);
    fixture.detectChanges();

    expect(el.querySelector('button.surface')).toBeNull();
    expect(el.querySelector('div.surface')).not.toBeNull();
  });

  it('keeps the placeholder and the picture inside the surface either way', () => {
    const { fixture, host, el } = mount();
    expect(el.querySelector('.surface .placeholder')).not.toBeNull();

    host.src.set('/api/images/x?size=display');
    fixture.detectChanges();
    expect(el.querySelector('.surface .image')).not.toBeNull();
  });
});
