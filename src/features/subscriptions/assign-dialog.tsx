'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { plans, subscriptions } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/problems';
import type { SubscriptionDetail } from '@/types/api';

// `plans.list` defaults to a 25-row page; the API caps `pageSize` at 200 (`PagedResult.MaxPageSize`,
// GymOS-Backend), so this asks for that ceiling rather than letting a 26th active plan become
// unreachable from this picker with nothing on screen explaining why.
const PLAN_PAGE_SIZE = 200;

/**
 * Assigns a plan to a gym for the first time, or changes the plan a gym is already on — one dialog,
 * because both submit the same request (`subscriptions.assign`, D5: no precondition, no read-then-write
 * race to guard against). Only the trigger label and the confirmation copy differ, driven by whether a
 * subscription already exists.
 *
 * The plan picker offers only assignable plans (`plans.list({ includeInactive: false })`); the currency
 * picker is then limited to currencies the *chosen plan* actually prices for the chosen cycle, which
 * needs the plan's own price list (`plans.get`), not the summary `plans.list` returns.
 */
export function AssignPlanDialog({
  gymId,
  subscription,
  canManage,
  onAssigned,
}: {
  gymId: string;
  subscription: SubscriptionDetail | null;
  canManage: boolean;
  onAssigned: (subscription: SubscriptionDetail) => void;
}) {
  const [open, setOpen] = useState(false);
  const [planId, setPlanId] = useState('');
  const [billingCycle, setBillingCycle] = useState('');
  const [currency, setCurrency] = useState('');
  const [saving, setSaving] = useState(false);

  const plansQuery = useQuery({
    queryKey: ['plans', 'list', 'assignable'],
    queryFn: ({ signal }) =>
      plans.list({ includeInactive: false, pageSize: PLAN_PAGE_SIZE }, signal),
    enabled: open,
  });

  const planDetailQuery = useQuery({
    queryKey: ['plans', 'detail', planId],
    queryFn: ({ signal }) => plans.get(planId, signal),
    enabled: open && planId.length > 0,
  });

  // Preserves the order prices were declared in rather than an alphabetised list — a plan's own
  // Monthly/Quarterly/Yearly ordering (price-editor.tsx) is the one already familiar from the Prices tab.
  const cycleOptions = useMemo(() => {
    const prices = planDetailQuery.data?.prices ?? [];
    const seen = new Set<string>();
    return prices
      .map((price) => price.billingCycle)
      .filter((cycle) => {
        if (seen.has(cycle)) return false;
        seen.add(cycle);
        return true;
      });
  }, [planDetailQuery.data]);

  // The picker's *effective* cycle: the explicitly chosen one if the current plan still offers it,
  // otherwise the plan's first cycle. Derived at render time rather than synced into state via an
  // effect — an effect that calls `setState` to correct a stale selection is itself the render, just
  // one tick later, so the value the user sees for that one tick would be wrong.
  const effectiveCycle = cycleOptions.includes(billingCycle)
    ? billingCycle
    : (cycleOptions[0] ?? '');

  const currencyOptions = useMemo(() => {
    const prices = planDetailQuery.data?.prices ?? [];
    const seen = new Set<string>();
    return prices
      .filter((price) => price.billingCycle === effectiveCycle)
      .map((price) => price.currency)
      .filter((code) => {
        if (seen.has(code)) return false;
        seen.add(code);
        return true;
      });
  }, [planDetailQuery.data, effectiveCycle]);

  const effectiveCurrency = currencyOptions.includes(currency)
    ? currency
    : (currencyOptions[0] ?? '');

  const reset = () => {
    setPlanId('');
    setBillingCycle('');
    setCurrency('');
  };

  const submit = async () => {
    if (!planId || !effectiveCycle || !effectiveCurrency) {
      toast.error('Choose a plan, billing cycle, and currency.');
      return;
    }

    setSaving(true);
    try {
      const updated = await subscriptions.assign(gymId, {
        planId,
        billingCycle: effectiveCycle,
        currency: effectiveCurrency,
      });
      toast.success('Plan assigned.');
      onAssigned(updated);
      setOpen(false);
      reset();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) {
    return null;
  }

  const hasSubscription = subscription !== null;

  return (
    <>
      <Button variant={hasSubscription ? 'outline' : 'primary'} onClick={() => setOpen(true)}>
        {hasSubscription ? 'Change plan' : 'Assign plan'}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{hasSubscription ? 'Change plan' : 'Assign plan'}</DialogTitle>
            <DialogDescription>
              {hasSubscription
                ? 'The new plan and price take effect immediately.'
                : 'The gym starts billing on this plan and price right away.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="assign-plan">Plan</Label>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger id="assign-plan">
                  <SelectValue placeholder="Select a plan" />
                </SelectTrigger>
                <SelectContent>
                  {plansQuery.data?.items.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.name} ({plan.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="assign-cycle">Billing cycle</Label>
              <Select
                value={effectiveCycle}
                onValueChange={setBillingCycle}
                disabled={cycleOptions.length === 0}
              >
                <SelectTrigger id="assign-cycle">
                  <SelectValue
                    placeholder={planId ? 'No prices on this plan' : 'Choose a plan first'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {cycleOptions.map((cycle) => (
                    <SelectItem key={cycle} value={cycle}>
                      {cycle}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="assign-currency">Currency</Label>
              <Select
                value={effectiveCurrency}
                onValueChange={setCurrency}
                disabled={currencyOptions.length === 0}
              >
                <SelectTrigger id="assign-currency">
                  <SelectValue placeholder="Choose a billing cycle first" />
                </SelectTrigger>
                <SelectContent>
                  {currencyOptions.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              loading={saving}
              disabled={!planId || !effectiveCycle || !effectiveCurrency}
            >
              {hasSubscription ? 'Change plan' : 'Assign plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
