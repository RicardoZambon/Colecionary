import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastService } from './toast.service';

/**
 * The queue and the tones.
 *
 * Both exist for the same reason: a message the user never read is
 * indistinguishable, from where they are sitting, from a message that was never
 * sent. The old single-slot toast cleared the previous timer on every new
 * message, so two things happening within 1.8 seconds meant one of them was
 * silently dropped — and there was no tone at all, so a failure was painted in
 * the accent colour and read as a success.
 */
describe('ToastService', () => {
  let toast: ToastService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    toast = TestBed.inject(ToastService);
  });

  afterEach(() => vi.useRealTimers());

  it('shows nothing to begin with', () => {
    expect(toast.current()).toBeNull();
    expect(toast.message()).toBeNull();
  });

  it('queues messages instead of replacing the one on screen', () => {
    toast.flash('Photo added');
    toast.flash('Copy added');

    expect(toast.message()).toBe('Photo added');
    expect(toast.waiting()).toBe(1);

    // The first one gets its full turn, and only then does the second start.
    vi.advanceTimersByTime(2600);
    expect(toast.message()).toBe('Copy added');
    expect(toast.waiting()).toBe(0);

    vi.advanceTimersByTime(2600);
    expect(toast.message()).toBeNull();
  });

  it('drops a message identical to one showing or waiting', () => {
    // Two reporters — the global interceptor and a page's own catch — describing
    // the same failure. Saying it twice is noise, not emphasis.
    toast.error('Could not save the item');
    toast.error('Could not save the item');

    expect(toast.waiting()).toBe(0);
  });

  it('marks the tone, and only an error keeps a marker of its own', () => {
    toast.success('Saved');
    expect(toast.current()!.tone).toBe('success');

    toast.dismiss();
    toast.error('Not saved');
    expect(toast.current()!.tone).toBe('error');
  });

  it('never expires an error on its own', () => {
    toast.error('Could not delete the item');

    // Long past every timeout in the app. A failure the user did not see is a
    // failure they believe succeeded.
    vi.advanceTimersByTime(60_000);
    expect(toast.message()).toBe('Could not delete the item');

    toast.dismiss();
    expect(toast.message()).toBeNull();
  });

  it('holds the queue behind an error rather than talking over it', () => {
    toast.error('Could not save the item');
    toast.flash('Order saved');

    vi.advanceTimersByTime(60_000);
    // The messages after a failure are usually consequences of it; letting them
    // scroll past the failure is exactly how the failure gets missed.
    expect(toast.message()).toBe('Could not save the item');

    toast.dismiss();
    expect(toast.message()).toBe('Order saved');
  });

  it('runs an action once and closes the toast that offered it', async () => {
    const run = vi.fn();
    toast.flash('Item deleted', { labelKey: 'toast.undo', run });

    toast.act();
    expect(run).toHaveBeenCalledOnce();
    expect(toast.message()).toBeNull();

    // Nothing left to act on: a second click cannot undo twice.
    toast.act();
    expect(run).toHaveBeenCalledOnce();
  });

  it('lets the next message start as soon as one is dismissed by hand', () => {
    toast.flash('First');
    toast.flash('Second');

    toast.dismiss();
    expect(toast.message()).toBe('Second');
    // The new head is on a timer of its own, not on the remainder of the old one.
    vi.advanceTimersByTime(2599);
    expect(toast.message()).toBe('Second');
    vi.advanceTimersByTime(1);
    expect(toast.message()).toBeNull();
  });

  it('ignores an empty message', () => {
    toast.flash('');
    expect(toast.current()).toBeNull();
  });
});
