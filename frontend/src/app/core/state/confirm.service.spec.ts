import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { ConfirmRequest, ConfirmService } from './confirm.service';

const REQUEST: ConfirmRequest = {
  titleKey: 'item.delete.confirm.title',
  bodyKey: 'item.delete.confirm.body',
  params: { name: 'Rubber Soul' },
  confirmKey: 'item.delete.confirm.ok',
  tone: 'danger',
};

/**
 * The contract every destructive action in the app now leans on.
 *
 * What is pinned here is not the wording but the promise: `ask()` always
 * settles, it settles `false` for anything that is not an explicit yes, and it
 * never rejects — a caller about to delete something must never have to guess
 * what an unresolved promise meant.
 */
describe('ConfirmService', () => {
  let confirm: ConfirmService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    confirm = TestBed.inject(ConfirmService);
  });

  it('asks nothing until it is asked', () => {
    expect(confirm.pending()).toBeNull();
  });

  it('publishes the question for the outlet to render', () => {
    void confirm.ask(REQUEST);
    expect(confirm.pending()).toEqual(REQUEST);
  });

  it('resolves true only for an explicit yes, and closes', async () => {
    const answer = confirm.ask(REQUEST);
    confirm.answer(true);

    await expect(answer).resolves.toBe(true);
    expect(confirm.pending()).toBeNull();
  });

  it('resolves false for a no', async () => {
    const answer = confirm.ask(REQUEST);
    confirm.answer(false);

    await expect(answer).resolves.toBe(false);
    expect(confirm.pending()).toBeNull();
  });

  it('answers an outstanding question "no" when a second one arrives', async () => {
    // A promise nobody ever settles is a caller stuck halfway through a delete.
    // Replacing the question has to release the first one, and the only safe
    // release is "nothing happened".
    const first = confirm.ask(REQUEST);
    const second = confirm.ask({ ...REQUEST, titleKey: 'settings.access.remove.confirm.title' });

    await expect(first).resolves.toBe(false);
    expect(confirm.pending()?.titleKey).toBe('settings.access.remove.confirm.title');

    confirm.answer(true);
    await expect(second).resolves.toBe(true);
  });

  it('ignores an answer when nothing is being asked', () => {
    expect(() => confirm.answer(true)).not.toThrow();
    expect(confirm.pending()).toBeNull();
  });

  it('cannot be answered twice', async () => {
    const answer = confirm.ask(REQUEST);
    confirm.answer(true);
    // A second click on a button that is already gone, or a dismissal racing a
    // confirmation: the first answer stands.
    confirm.answer(false);

    await expect(answer).resolves.toBe(true);
  });
});
