import { Injectable, signal } from '@angular/core';

const TOAST_DURATION_MS = 1800;

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly messageState = signal<string | null>(null);
  private timer: ReturnType<typeof setTimeout> | undefined;

  readonly message = this.messageState.asReadonly();

  flash(message: string): void {
    this.messageState.set(message);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.messageState.set(null), TOAST_DURATION_MS);
  }
}
