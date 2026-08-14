import { Plan } from '../../core/models';

/** Plan catalog — marketing configuration, not backend data. */
export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    priceKey: 'plan.free.price',
    featureKeys: [
      'plan.free.feature.collections',
      'plan.free.feature.items',
      'plan.free.feature.photos',
      'plan.free.feature.fields',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    priceKey: 'plan.pro.price',
    featureKeys: [
      'plan.pro.feature.collections',
      'plan.pro.feature.photos',
      'plan.pro.feature.fields',
      'plan.pro.feature.value',
    ],
  },
];
