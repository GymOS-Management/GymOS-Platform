'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CreditCard, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataTable, type Column } from '@/components/data/data-table';
import { EmptyState } from '@/components/data/empty-state';
import { plans } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/problems';
import { formatMoney } from '@/lib/utils/format';
import type { PlanDetail, PlanPriceDetail } from '@/types/api';

/** The only billing cycles the domain recognises (BillingCycle.cs) — stable, so a free-text field would only invite typos the API refuses anyway. */
const BILLING_CYCLES = ['Monthly', 'Quarterly', 'Yearly'] as const;

/**
 * What this component actually reads off a price. Deliberately narrower than the full
 * `PlanPriceDetail` (which also carries `billingCycleMonths`, unused here) so a caller can pass a row
 * built from just the fields that matter without also having to know the cycle's month count.
 */
type PriceRow = Pick<PlanPriceDetail, 'id' | 'billingCycle' | 'currency' | 'amount'>;

/**
 * The per-cycle, per-currency price list for a plan.
 *
 * `setPrice` upserts by `(billingCycle, currency)` (endpoints.ts): submitting a pair that already
 * exists *changes* that price rather than failing, so the Add-price dialog says so — an operator who
 * expects a duplicate error and gets a silent overwrite has been misled by the UI, not the API.
 *
 * No react-query here on purpose: every mutation gets the plan's full, current state back in the
 * response, so this component tracks its own copy of `prices`/`rowVersion` rather than depending on an
 * ambient `QueryClient`. `onChanged` lets the detail page keep its own cache (and the Overview tab's
 * rowVersion) in step, but nothing here requires a provider to render or to work.
 */
export function PriceEditor({
  planId,
  rowVersion,
  prices,
  canManage,
  onChanged,
}: {
  planId: string;
  rowVersion: string;
  prices: PriceRow[];
  canManage: boolean;
  onChanged?: (plan: PlanDetail) => void;
}) {
  const [currentPrices, setCurrentPrices] = useState(prices);
  const [currentRowVersion, setCurrentRowVersion] = useState(rowVersion);

  const [addOpen, setAddOpen] = useState(false);
  const [billingCycle, setBillingCycle] = useState<string>(BILLING_CYCLES[0]);
  const [currency, setCurrency] = useState('EUR');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const [removingId, setRemovingId] = useState<string | null>(null);

  const applyUpdated = (plan: PlanDetail) => {
    setCurrentPrices(plan.prices);
    setCurrentRowVersion(plan.rowVersion);
    onChanged?.(plan);
  };

  const fail = (error: unknown) => {
    toast.error(error instanceof ApiError ? error.message : 'Something went wrong.');
  };

  const submitAdd = async () => {
    const parsedAmount = Number(amount);

    if (!currency.trim() || !Number.isFinite(parsedAmount)) {
      toast.error('Enter a currency and a valid amount.');
      return;
    }

    setSaving(true);
    try {
      const updated = await plans.setPrice(
        planId,
        { billingCycle, currency: currency.trim().toUpperCase(), amount: parsedAmount },
        currentRowVersion,
      );
      toast.success('Price saved.');
      applyUpdated(updated);
      setAddOpen(false);
      setAmount('');
    } catch (error) {
      fail(error);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (price: PriceRow) => {
    setRemovingId(price.id);
    try {
      const updated = await plans.removePrice(planId, price.id, currentRowVersion);
      toast.success('Price removed.');
      applyUpdated(updated);
    } catch (error) {
      fail(error);
    } finally {
      setRemovingId(null);
    }
  };

  const columns: Column<PriceRow>[] = [
    {
      key: 'billingCycle',
      header: 'Cycle',
      primary: true,
      render: (price) => price.billingCycle,
    },
    {
      key: 'currency',
      header: 'Currency',
      render: (price) => price.currency,
    },
    {
      // A normal column, on purpose: the price amount is the single most important field on this
      // screen, so it must render on the mobile card, not just the desktop table. `DataTable` renders
      // row content twice — once per breakpoint's markup, both present in the DOM at once — and that
      // duplication is documented, intentional behaviour (docs/F1-AS-BUILT.md), not something to design
      // around by hiding a column. The corresponding test scopes its query instead of avoiding the
      // duplication here.
      key: 'amount',
      header: 'Amount',
      render: (price) => formatMoney(price.amount, price.currency),
    },
  ];

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Add price
          </Button>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={currentPrices}
        rowKey={(price) => price.id}
        empty={
          <EmptyState
            icon={CreditCard}
            title="No prices yet"
            description="Add a price for at least one billing cycle before assigning this plan to a gym."
          />
        }
        rowActions={
          canManage
            ? (price) => (
                <Button
                  variant="ghost"
                  size="sm"
                  loading={removingId === price.id}
                  onClick={() => remove(price)}
                >
                  Remove
                </Button>
              )
            : undefined
        }
      />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add price</DialogTitle>
            <DialogDescription>
              Setting a price for a cycle and currency that already exists on this plan changes that
              price — it does not create a duplicate or fail.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="price-cycle">Billing cycle</Label>
              <Select value={billingCycle} onValueChange={setBillingCycle}>
                <SelectTrigger id="price-cycle">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BILLING_CYCLES.map((cycle) => (
                    <SelectItem key={cycle} value={cycle}>
                      {cycle}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="price-currency">Currency</Label>
              <Input
                id="price-currency"
                maxLength={3}
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="EUR"
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
              />
              <p className="text-muted-foreground text-xs">ISO, e.g. EUR.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="price-amount">Amount</Label>
              <Input
                id="price-amount"
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submitAdd} loading={saving}>
              Save price
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
