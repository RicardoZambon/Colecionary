import { MemberRole } from './member.model';
import { MessageKey } from '../i18n/messages/keys';

export type PlanId = 'free' | 'pro';

export interface Plan {
  id: PlanId;
  /** Proper noun ("Free", "Pro") — a name, so never translated. */
  name: string;
  /** Keyed because the period is words: `$6/mo` → `$6/mês`. */
  priceKey: MessageKey;
  featureKeys: MessageKey[];
}

export interface UserProfile {
  name: string;
  email: string;
  initials: string;
  plan: PlanId;
  /**
   * This person's role in the vault, as the server sees it.
   *
   * Read-only: the server ignores it on a write. It is here so the app can stop
   * *offering* what the server would refuse — every catalogue write is now
   * Owner-or-Editor, and a Viewer shown an "Add item" button is a button that
   * always fails. Read it through `VaultStore.canEdit`, never by comparing the
   * string at a call site.
   */
  role: MemberRole;
}
