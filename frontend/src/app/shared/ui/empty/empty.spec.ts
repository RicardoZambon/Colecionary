import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { UiEmpty } from './empty';

@Component({
  imports: [UiEmpty],
  template: `
    <ui-empty [icon]="icon()" [title]="title()" [body]="body()" [compact]="compact()">
      @if (withAction()) {
        <button emptyActions type="button">Add one</button>
      }
    </ui-empty>
  `,
})
class HostComponent {
  readonly icon = signal<'tag' | 'search'>('tag');
  readonly title = signal('No items yet');
  readonly body = signal<string | null>(null);
  readonly compact = signal(false);
  readonly withAction = signal(false);
}

function mount(patch: Partial<Record<'icon' | 'title' | 'body' | 'compact' | 'withAction', unknown>> = {}) {
  const fixture = TestBed.createComponent(HostComponent);
  const host = fixture.componentInstance;
  for (const [key, value] of Object.entries(patch)) {
    (host[key as keyof HostComponent] as { set(v: unknown): void }).set(value);
  }
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    host,
    root: el.querySelector('ui-empty')!,
    title: el.querySelector('.title'),
    body: el.querySelector('.body'),
    icon: el.querySelector('ui-icon'),
    actions: el.querySelector('.actions') as HTMLElement,
  };
}

describe('UiEmpty', () => {
  it('states what is empty', () => {
    expect(mount().title?.textContent?.trim()).toBe('No items yet');
  });

  it('omits the body entirely when there is nothing to add', () => {
    // Not an empty paragraph: a blank <p> still occupies a line and pushes the
    // block off centre.
    expect(mount().body).toBeNull();
    expect(mount({ body: 'Clear the filters to see everything.' }).body?.textContent?.trim()).toBe(
      'Clear the filters to see everything.',
    );
  });

  it('hides the mark from assistive tech — the title already says it', () => {
    expect(mount().icon?.getAttribute('aria-hidden')).toBe('true');
    expect(mount().icon?.getAttribute('role')).toBeNull();
  });

  it('is not a live region', () => {
    // These render on first paint, where role="status" announces nothing while
    // taking the announcement away from whatever genuinely changed.
    const { root } = mount();
    expect(root.getAttribute('role')).toBeNull();
    expect(root.getAttribute('aria-live')).toBeNull();
  });

  it('projects the way out', () => {
    expect(mount().actions.querySelector('button')).toBeNull();
    expect(mount({ withAction: true }).actions.querySelector('button')?.textContent).toBe('Add one');
  });

  it('marks the compact form on the host, and shrinks the mark with it', () => {
    expect(mount().root.classList).not.toContain('compact');
    expect(mount().icon?.querySelector('svg')?.getAttribute('width')).toBe('28');

    const compact = mount({ compact: true });
    expect(compact.root.classList).toContain('compact');
    expect(compact.icon?.querySelector('svg')?.getAttribute('width')).toBe('16');
  });

  it('follows a title that changes without being remounted', () => {
    // The copy comes from the `t` pipe, which is impure so it can follow a
    // language switch; a component that cached the string would freeze it.
    const { fixture, host, root } = mount();
    host.title.set('Nada catalogado ainda');
    fixture.detectChanges();
    expect(root.querySelector('.title')?.textContent?.trim()).toBe('Nada catalogado ainda');
  });
});
