import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { I18nService } from '../../../core/i18n';
import { ToastService } from '../../../core/state/toast.service';
import { UiToast } from './toast';

/**
 * What the outlet owes a message it draws.
 *
 * The live regions are the point: assistive technology announces changes
 * *inside* a region it was already observing, so the old outlet — which created
 * the `role="status"` element together with its text — announced nothing at
 * all except errors, `role="alert"` being the one shape screen readers still
 * catch on insertion. A save, an export and a role change were silent.
 */
describe('UiToast', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<UiToast>>;
  let toast: ToastService;
  let el: HTMLElement;

  function polite() {
    return el.querySelector('[role=status]') as HTMLElement;
  }

  function assertive() {
    return el.querySelector('[role=alert]') as HTMLElement;
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.inject(I18nService).apply('en');
    toast = TestBed.inject(ToastService);
    toast.clear();
    fixture = TestBed.createComponent(UiToast);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('keeps both live regions in the DOM and empty while there is nothing to say', () => {
    expect(polite()).toBeTruthy();
    expect(assertive()).toBeTruthy();
    expect(polite().textContent).toBe('');
    expect(assertive().textContent).toBe('');
  });

  it('announces information politely, which used not to be announced at all', () => {
    toast.flash('Collection created');
    fixture.detectChanges();

    expect(polite().textContent).toContain('Collection created');
    expect(assertive().textContent).toBe('');
  });

  it('announces a failure assertively, with the marker word', () => {
    toast.error("Couldn't save the item");
    fixture.detectChanges();

    expect(assertive().textContent).toContain("Couldn't save the item");
    // The tone in words, not only in colour — the same marker the toast draws.
    expect(assertive().textContent).not.toBe("Couldn't save the item");
    expect(polite().textContent).toBe('');
  });

  it('offers a close button whatever the tone, because dismissal is not a tone', () => {
    toast.flash('Photo added');
    fixture.detectChanges();

    const close = el.querySelector('.toast__close') as HTMLButtonElement;
    expect(close).toBeTruthy();

    close.click();
    fixture.detectChanges();

    expect(toast.current()).toBeNull();
  });

  it('does not announce the drawn text a second time', () => {
    toast.success('Saved');
    fixture.detectChanges();

    const visible = el.querySelector('.toast') as HTMLElement;
    expect(visible.getAttribute('aria-live')).toBe(null);
    expect(visible.getAttribute('role')).toBe(null);
    expect((el.querySelector('.toast__text') as HTMLElement).getAttribute('aria-hidden')).toBe(
      'true',
    );
  });
});
