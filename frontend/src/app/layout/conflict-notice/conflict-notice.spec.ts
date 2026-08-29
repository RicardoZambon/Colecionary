import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nService } from '../../core/i18n';
import { ConflictService } from '../../core/state/conflict.service';
import { ToastService } from '../../core/state/toast.service';
import { VaultStore } from '../../core/state/vault.store';
import { ConflictNotice } from './conflict-notice';

/**
 * The visible half of optimistic concurrency.
 *
 * What is being pinned is not the styling but the promise: when a save is
 * refused, the user is told plainly, in their own language, and is given
 * something to do about it — and nothing happens to their work unless they ask
 * for it.
 */
describe('ConflictNotice', () => {
  let fixture: ComponentFixture<ConflictNotice>;
  let el: HTMLElement;
  let conflicts: ConflictService;
  let store: { load: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    TestBed.resetTestingModule();
    store = { load: vi.fn().mockResolvedValue(undefined) };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: VaultStore, useValue: store },
      ],
    });
    TestBed.inject(I18nService).apply('en');
    conflicts = TestBed.inject(ConflictService);
    fixture = TestBed.createComponent(ConflictNotice);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  const raise = () => {
    conflicts.raise({ collectionId: 'c1', message: 'Nothing was saved.' });
    fixture.detectChanges();
  };

  const button = (label: string) =>
    [...el.querySelectorAll('button')].find(b => b.textContent!.trim() === label)!;

  it('shows nothing until a save is refused', () => {
    expect(el.querySelector('.notice')).toBeNull();
  });

  it('says what happened, in the server’s words, and that the work is still there', () => {
    raise();

    const notice = el.querySelector('.notice')!;
    // Announced, not just drawn: the user's attention is on the form they just
    // tried to save, not on the corner of the screen.
    expect(notice.getAttribute('role')).toBe('alert');

    const i18n = TestBed.inject(I18nService);
    expect(notice.textContent).toContain(i18n.t('conflict.title'));
    // The server's own sentence, already localized — it is the only party that
    // knows what actually happened.
    expect(notice.textContent).toContain('Nothing was saved.');
    // …and ours, which is the part that stops the user assuming they lost it.
    expect(notice.textContent).toContain(i18n.t('conflict.keepsYourWork'));
  });

  it('offers both ways forward as real buttons', () => {
    raise();
    const i18n = TestBed.inject(I18nService);
    expect(button(i18n.t('conflict.reload'))).toBeTruthy();
    expect(button(i18n.t('conflict.keep'))).toBeTruthy();
  });

  it('never reloads on its own — dismissing leaves the screen exactly as it was', () => {
    raise();
    button(TestBed.inject(I18nService).t('conflict.keep')).click();
    fixture.detectChanges();

    expect(store.load).not.toHaveBeenCalled();
    expect(el.querySelector('.notice')).toBeNull();
  });

  it('reloads when asked, and only then closes', async () => {
    raise();
    button(TestBed.inject(I18nService).t('conflict.reload')).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(store.load).toHaveBeenCalledOnce();
    expect(el.querySelector('.notice')).toBeNull();
  });

  it('stays open when the reload fails', async () => {
    store.load.mockRejectedValueOnce(new Error('offline'));
    raise();
    button(TestBed.inject(I18nService).t('conflict.reload')).click();
    await fixture.whenStable();
    fixture.detectChanges();

    // Closing here would leave the user believing they are back in sync while
    // holding a version the server has already replaced.
    expect(el.querySelector('.notice')).toBeTruthy();
    expect(TestBed.inject(ToastService).message()).toBe(
      TestBed.inject(I18nService).t('conflict.reloadFailed'),
    );
  });

  it('follows the language', () => {
    raise();
    const i18n = TestBed.inject(I18nService);
    i18n.apply('pt-BR');
    fixture.detectChanges();

    expect(el.querySelector('.notice')!.textContent).toContain(i18n.t('conflict.title'));
    expect(i18n.t('conflict.title')).not.toBe('Saved somewhere else first');
  });
});
