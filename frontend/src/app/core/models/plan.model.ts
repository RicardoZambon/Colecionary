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
}
