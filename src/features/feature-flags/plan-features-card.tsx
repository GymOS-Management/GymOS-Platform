'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiErrorText } from '@/components/feedback/api-error-text';
import { FeatureGroupList } from '@/features/feature-flags/feature-group-list';
import { features as featuresApi, plans } from '@/lib/api/endpoints';
import { toastApiError } from '@/lib/feedback/toast-api-error';
import {
  fromResponseValue,
  toRequestValue,
  type PlanFeatureState,
} from '@/lib/features/plan-state';
import type { PlanFeatureRequest } from '@/types/api';

/**
 * One catalogue key, as it applies to a plan: the plan's opinion (`state`) plus what silence resolves
 * to today (`defaultEnabled`), so the third state has a visible consequence rather than reading as
 * "off".
 */
export interface PlanFeatureRow {
  key: string;
  name: string;
  category: string;
  state: PlanFeatureState;
  defaultEnabled: boolean;
}

const LABELS: { state: PlanFeatureState; label: string }[] = [
  { state: 'included', label: 'Included' },
  { state: 'excluded', label: 'Excluded' },
  { state: 'default', label: 'Default' },
];

/**
 * What a plan includes, presented as three buttons per feature rather than a checkbox: `default` is
 * its own state, not a midpoint between on and off, and a two-state control has no way to represent
 * "no opinion" (Features.md).
 *
 * Tracks pending state locally and, on Save, maps only the **changed** rows through `toRequestValue`.
 * `PUT /plans/{id}/features` refuses an empty list, so a submit with nothing changed must never reach
 * `onSubmit` at all.
 */
export function PlanFeaturesList({
  rows,
  canManage,
  onSubmit,
}: {
  rows: PlanFeatureRow[];
  canManage: boolean;
  onSubmit: (changes: PlanFeatureRequest[]) => void;
}) {
  const [prevRows, setPrevRows] = React.useState(rows);
  const [draft, setDraft] = React.useState<Record<string, PlanFeatureState>>(() =>
    initialDraft(rows),
  );

  if (rows !== prevRows) {
    setPrevRows(rows);
    setDraft(initialDraft(rows));
  }

  const setState = (key: string, state: PlanFeatureState) => {
    setDraft((prev) => ({ ...prev, [key]: state }));
  };

  const handleSave = () => {
    const changed = rows.filter((row) => draft[row.key] !== row.state);

    if (changed.length === 0) {
      return;
    }

    onSubmit(changed.map((row) => ({ key: row.key, isEnabled: toRequestValue(draft[row.key]!) })));
  };

  return (
    <div className="space-y-6">
      <FeatureGroupList items={rows} categoryOf={(row) => row.category}>
        {(row) => (
          <PlanFeatureRowControl
            key={row.key}
            row={row}
            canManage={canManage}
            state={draft[row.key] ?? row.state}
            onChange={(state) => setState(row.key, state)}
          />
        )}
      </FeatureGroupList>

      {canManage && (
        <Button type="button" onClick={handleSave}>
          Save
        </Button>
      )}
    </div>
  );
}

function initialDraft(rows: PlanFeatureRow[]): Record<string, PlanFeatureState> {
  const draft: Record<string, PlanFeatureState> = {};

  for (const row of rows) {
    draft[row.key] = row.state;
  }

  return draft;
}

function PlanFeatureRowControl({
  row,
  canManage,
  state,
  onChange,
}: {
  row: PlanFeatureRow;
  canManage: boolean;
  state: PlanFeatureState;
  onChange: (state: PlanFeatureState) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border p-3">
      <div className="min-w-48 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.name}</span>
          <code className="text-muted-foreground text-xs">{row.key}</code>
        </div>
      </div>

      <div className="flex flex-col items-end gap-1">
        <div className="flex flex-wrap gap-2">
          {LABELS.map(({ state: candidate, label }) => (
            <Button
              key={candidate}
              type="button"
              variant={state === candidate ? 'primary' : 'outline'}
              size="sm"
              aria-pressed={state === candidate}
              disabled={!canManage}
              onClick={() => onChange(candidate)}
            >
              {label}
            </Button>
          ))}
        </div>
        {/* Silence's consequence, made visible: `default` is not "off" — it is "follow the platform
            default, today", and that answer can change under the plan without anyone touching it. */}
        <span className="text-muted-foreground text-xs">
          Default today: {row.defaultEnabled ? 'on' : 'off'}
        </span>
      </div>
    </div>
  );
}

/**
 * The query container: joins the plan's own opinions to the shared catalogue and owns the write.
 *
 * Built from the **catalogue**, not the plan's rows: a plan's opinions (`plan.features`) list only the
 * keys it has taken a stance on, which is the minority. Driving from that list instead of the
 * catalogue would silently omit every feature the plan has no view on — precisely the third state this
 * card exists to make visible (D2, Features.md).
 */
export function PlanFeaturesCard({
  planId,
  rowVersion,
  canManage,
}: {
  planId: string;
  rowVersion: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();

  const planQuery = useQuery({
    queryKey: ['plan-features', planId],
    queryFn: ({ signal }) => plans.features(planId, signal),
  });

  const catalogueQuery = useQuery({
    queryKey: ['features'],
    queryFn: ({ signal }) => featuresApi.list(signal),
  });

  const save = useMutation({
    mutationFn: (changes: PlanFeatureRequest[]) =>
      plans.setFeatures(planId, { features: changes }, rowVersion),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plan-features', planId] });
      queryClient.invalidateQueries({ queryKey: ['plans', 'detail', planId] });
    },
    onError: (error) => toastApiError(error),
  });

  if (planQuery.isPending || catalogueQuery.isPending) {
    return <Skeleton className="h-64 w-full" aria-busy="true" />;
  }

  if (planQuery.isError) {
    return <ApiErrorText error={planQuery.error} />;
  }

  if (catalogueQuery.isError) {
    return <ApiErrorText error={catalogueQuery.error} />;
  }

  const plan = planQuery.data;
  const catalogue = catalogueQuery.data;

  const rows: PlanFeatureRow[] = catalogue.map((feature) => {
    const opinion = plan.features.find((row) => row.key === feature.key);

    return {
      key: feature.key,
      name: feature.name,
      category: feature.category,
      state: fromResponseValue(opinion?.isEnabled),
      defaultEnabled: feature.defaultEnabled,
    };
  });

  return (
    <PlanFeaturesList
      rows={rows}
      canManage={canManage}
      onSubmit={(changes) => save.mutate(changes)}
    />
  );
}
