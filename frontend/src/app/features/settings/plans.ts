import { Plan } from '../../core/models';

/** Plan catalog — marketing configuration, not backend data. */
export const PLANS: Plan[] = [
  { id: 'free', name: 'Free', price: '$0', features: ['2 collections', 'Up to 100 items', '1 photo per item', 'Common fields only'] },
  { id: 'pro', name: 'Pro', price: '$6/mo', features: ['Unlimited collections & items', '8 photos per item', 'Custom fields & groups', 'Value tracking & backups'] },
];
