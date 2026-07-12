import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { Member } from '../../../core/models';
import { UiAvatar } from './avatar';

const MAX_SHOWN = 4;

@Component({
  selector: 'ui-avatar-stack',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiAvatar],
  template: `
    @for (member of shown(); track member.email) {
      <ui-avatar size="sm" [initials]="member.initials" [title]="member.name + ' · ' + member.role" />
    }
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      padding-left: 6px;
    }

    ui-avatar {
      margin-left: -6px;
    }
  `,
})
export class UiAvatarStack {
  readonly members = input.required<Member[]>();
  protected readonly shown = computed(() => this.members().slice(0, MAX_SHOWN));
}
