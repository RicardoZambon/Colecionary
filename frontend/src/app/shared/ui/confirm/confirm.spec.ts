import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { I18nService } from '../../../core/i18n';
import { ConfirmRequest, ConfirmService } from '../../../core/state/confirm.service';
import { UiConfirm } from './confirm';

const DANGER: ConfirmRequest = {
  titleKey: 'item.delete.confirm.title',
  bodyKey: 'item.delete.confirm.body',
  bodyParams: { name: 'Rubber Soul' },
  confirmKey: 'item.delete.confirm.ok',
  tone: 'danger',
};

/**
 * The visible half of "the app asks before it destroys something".
 *
 * The behaviours pinned here are the ones that make the dialog safe to answer
 * by reflex: it is an `alertdialog` so the consequence is announced with the
 * name, Escape and the scrim both mean no, and a destructive question opens
 * with the focus on Cancel so a held Enter cannot finish the gesture that
 * opened it.
 */
describe('UiConfirm', () => {
  let fixture: ComponentFixture<UiConfirm>;
  let el: HTMLElement;
  let confirm: ConfirmService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    TestBed.inject(I18nService).apply('en');
    confirm = TestBed.inject(ConfirmService);
    fixture = TestBed.createComponent(UiConfirm);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  const ask = (request: ConfirmRequest = DANGER) => {
    const answer = confirm.ask(request);
    fixture.detectChanges();
    return answer;
  };

  const button = (label: string) =>
    [...el.querySelectorAll('button')].find(b => b.textContent!.trim() === label)!;

  it('renders nothing until something is asked', () => {
    expect(el.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it('announces itself as an alertdialog, named by the title and described by the body', () => {
    ask();
    const i18n = TestBed.inject(I18nService);

    const dialog = el.querySelector('[role="alertdialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');

    const title = el.querySelector<HTMLElement>(`#${dialog.getAttribute('aria-labelledby')}`)!;
    expect(title.textContent).toContain(i18n.t('item.delete.confirm.title'));

    const body = el.querySelector<HTMLElement>(`#${dialog.getAttribute('aria-describedby')}`)!;
    // Named, not just "this item": which item is the whole question.
    expect(body.textContent).toContain('Rubber Soul');
  });

  it('offers both answers as real buttons and resolves the yes', async () => {
    const answer = ask();
    const i18n = TestBed.inject(I18nService);

    expect(button(i18n.t('common.cancel'))).toBeTruthy();
    button(i18n.t('item.delete.confirm.ok')).click();
    fixture.detectChanges();

    await expect(answer).resolves.toBe(true);
    expect(el.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it('resolves false on Cancel', async () => {
    const answer = ask();
    button(TestBed.inject(I18nService).t('common.cancel')).click();
    fixture.detectChanges();

    await expect(answer).resolves.toBe(false);
  });

  it('treats Escape as no', async () => {
    const answer = ask();
    el.querySelector('ui-dialog')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    fixture.detectChanges();

    await expect(answer).resolves.toBe(false);
  });

  it('treats the scrim as no', async () => {
    const answer = ask();
    (el.querySelector('.scrim') as HTMLElement).click();
    fixture.detectChanges();

    await expect(answer).resolves.toBe(false);
  });

  it('paints the destructive answer as destructive', () => {
    ask();
    // Colour is not the message here, the copy is — but the two must not
    // disagree, and `variant="danger"` is how every other destructive control
    // in the app is drawn.
    expect(el.querySelector('.confirm__ok button')!.className).toContain('btn--danger');
  });

  it('opens a destructive question with the focus on Cancel', async () => {
    ask();
    await fixture.whenStable();

    // The dialog shell focuses its panel; this deliberately overrides that for
    // the destructive tone, so the default keypress answers "no".
    expect(document.activeElement).toBe(el.querySelector('.confirm__cancel button'));
  });

  it('leaves an ordinary question on the panel, where the whole dialog is read', async () => {
    ask({
      titleKey: 'settings.access.remove.confirm.title',
      bodyKey: 'settings.access.remove.confirm.body',
      confirmKey: 'settings.access.remove.confirm.ok',
      tone: 'default',
    });
    await fixture.whenStable();

    expect(document.activeElement).toBe(el.querySelector('.panel'));
    expect(el.querySelector('.confirm__ok button')!.className).not.toContain('btn--danger');
  });

  it('follows the language', () => {
    ask();
    const i18n = TestBed.inject(I18nService);
    i18n.apply('pt-BR');
    fixture.detectChanges();

    expect(el.textContent).toContain(i18n.t('item.delete.confirm.ok'));
    expect(i18n.t('item.delete.confirm.ok')).not.toBe('Delete item');
  });
});
