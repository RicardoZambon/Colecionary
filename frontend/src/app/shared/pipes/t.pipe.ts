import { Pipe, PipeTransform, inject } from '@angular/core';

import { I18nService } from '../../core/i18n';
import { MessageKey, MessageParams } from '../../core/i18n/messages';

/**
 * Translates a message key: `{{ 'settings.title' | t }}`, or with placeholders
 * `{{ 'settings.access.removeMember' | t: { name: member.name } }}`.
 *
 * **`pure: false` is load-bearing — do not "optimize" it away.** A pure pipe is
 * memoized by its arguments: when the language changes the view re-renders, but
 * `transform` is handed the same key and Angular returns the cached string, so
 * every translation on screen would freeze in the old language. The cost of the
 * impure version is one dictionary lookup in views that were already being
 * checked, which under zoneless + OnPush is nothing.
 */
@Pipe({ name: 't', pure: false })
export class TPipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(key: MessageKey, params?: MessageParams): string {
    return this.i18n.t(key, params);
  }
}
