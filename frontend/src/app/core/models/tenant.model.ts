import { CurrencyCode } from '../utils/money.util';

/**
 * Settings that belong to the account rather than to the person signed in.
 *
 * Deliberately not folded into `UserProfile`: a currency held per user would
 * let two members of the same vault read the same collection as two different
 * amounts of money.
 */
export interface TenantSettings {
  /** ISO 4217 code every amount is read in unless a collection overrides it. */
  defaultCurrency: CurrencyCode;
}
