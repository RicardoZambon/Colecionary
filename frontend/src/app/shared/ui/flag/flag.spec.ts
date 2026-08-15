import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LANGS } from '../../../core/i18n/langs';
import { UiFlag } from './flag';

/** Every language in the catalog at once — the switcher renders them as a list. */
@Component({
  imports: [UiFlag],
  template: `
    @for (lang of langs; track lang.id) {
      <ui-flag [lang]="lang.id" />
    }
  `,
})
class HostComponent {
  readonly langs = LANGS;
}

function mount() {
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return [...fixture.nativeElement.querySelectorAll('ui-flag svg')] as SVGSVGElement[];
}

describe('UiFlag', () => {
  it('draws every language the catalog declares', () => {
    const flags = mount();

    expect(flags).toHaveLength(LANGS.length);
    for (const flag of flags) {
      // The clipped group is empty when a language reaches the switcher
      // without a flag of its own — the `@switch` has no fallback on purpose.
      expect(flag.querySelector('g')!.children.length).toBeGreaterThan(0);
    }
  });

  it('gives each instance its own clip ids', () => {
    const ids = mount().flatMap(flag =>
      [...flag.querySelectorAll('clipPath')].map(c => c.id),
    );

    // Ids are document-global: shared ones would clip every flag to the first.
    expect(new Set(ids).size).toBe(ids.length);
  });
});
