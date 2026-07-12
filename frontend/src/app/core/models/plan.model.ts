export type PlanId = 'free' | 'pro';

export interface Plan {
  id: PlanId;
  name: string;
  price: string;
  features: string[];
}

export interface UserProfile {
  name: string;
  email: string;
  initials: string;
  plan: PlanId;
}
