/**
 * What a plan says about one feature.
 *
 * `default` is not "off". A `plan_features` row is an opinion and its absence is silence: a plan
 * that excludes CRM and a plan with no view on CRM look identical to a gym today, and answer
 * differently the moment the platform default moves. That third state is why resolution has three
 * layers rather than two (Features.md).
 */
export type PlanFeatureState = 'included' | 'excluded' | 'default';

export function toRequestValue(state: PlanFeatureState): boolean | null {
  if (state === 'included') return true;
  if (state === 'excluded') return false;
  return null;
}

export function fromResponseValue(isEnabled: boolean | null | undefined): PlanFeatureState {
  if (isEnabled === true) return 'included';
  if (isEnabled === false) return 'excluded';
  return 'default';
}
