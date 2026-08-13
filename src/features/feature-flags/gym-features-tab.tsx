'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiErrorText } from '@/components/feedback/api-error-text';
import { FeatureGroupList } from '@/features/feature-flags/feature-group-list';
import { SourceBadge } from '@/features/feature-flags/source-badge';
import { gyms } from '@/lib/api/endpoints';
import { toastApiError } from '@/lib/feedback/toast-api-error';
import { overrideAge } from '@/lib/features/override-age';
import type { GymFeatureRequest, ResolvedFeatureDetail } from '@/types/api';

/**
 * Per-row edit state: the operator's in-progress answer for a feature, independent of the resolved
 * value until Save. Keyed by `featureId` rather than `key` for no particular reason beyond matching
 * the field the API treats as identity.
 */
interface Draft {
  enabled: boolean;
  reason: string;
}

function initialDraft(features: readonly ResolvedFeatureDetail[]): Record<string, Draft> {
  const draft: Record<string, Draft> = {};

  for (const feature of features) {
    draft[feature.featureId] = { enabled: feature.enabled, reason: '' };
  }

  return draft;
}

/**
 * The whole catalogue resolved for one gym — what it gets and why — with editing of the exceptions.
 *
 * Renders every feature, not only the ones with an override: "is POS on, and why?" is unanswerable
 * from a list of exceptions alone (Features.md).
 */
export function GymFeaturesList({
  features,
  canManage,
  now,
  onSubmit,
}: {
  features: readonly ResolvedFeatureDetail[];
  canManage: boolean;
  now: Date;
  onSubmit: (changes: GymFeatureRequest[]) => void;
}) {
  // Re-seeded whenever the resolved list changes identity — in particular after a save, so the form
  // reflects the fresh resolution (including a withdrawal collapsing back to the plan's answer)
  // rather than the pre-submit draft. Adjusted during render (React's documented pattern for
  // resetting state when a prop changes) rather than in an effect, so there is no extra commit.
  const [prevFeatures, setPrevFeatures] = React.useState(features);
  const [draft, setDraft] = React.useState<Record<string, Draft>>(() => initialDraft(features));
  const [error, setError] = React.useState<string | null>(null);

  if (features !== prevFeatures) {
    setPrevFeatures(features);
    setDraft(initialDraft(features));
    setError(null);
  }

  const setEnabled = (featureId: string, enabled: boolean) => {
    setDraft((prev) => ({
      ...prev,
      [featureId]: { enabled, reason: prev[featureId]?.reason ?? '' },
    }));
  };

  const setReason = (featureId: string, reason: string) => {
    setDraft((prev) => ({
      ...prev,
      [featureId]: { enabled: prev[featureId]?.enabled ?? false, reason },
    }));
  };

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();

    const changed = features.filter(
      (feature) => draft[feature.featureId]?.enabled !== feature.enabled,
    );

    // A reason is required on EVERY value change, not only the ones that turn out to create an
    // exception. `GET /gyms/{id}/features` gives the resolved value and its source, not what the gym
    // would inherit if an existing override vanished — that needs the live subscription's plan
    // opinion, and `GET /plans/{id}/features` sits behind `billing.read`, which the features
    // vocabulary deliberately excludes (a support agent holds `features.read` alone). So the console
    // cannot tell, before submitting, whether a given change will create an exception or withdraw
    // one — and asks for a reason unconditionally rather than guessing. When the change turns out to
    // be a withdrawal, the server simply leaves the reason unused.
    const missingReason = changed.some((feature) => draft[feature.featureId]!.reason.trim() === '');

    if (changed.length === 0) {
      return;
    }

    if (missingReason) {
      setError('A reason is required for every value change.');
      return;
    }

    setError(null);
    onSubmit(
      changed.map((feature) => ({
        key: feature.key,
        isEnabled: draft[feature.featureId]!.enabled,
        reason: draft[feature.featureId]!.reason.trim(),
      })),
    );
  };

  const body = (
    <FeatureGroupList items={features} categoryOf={(item) => item.category}>
      {(feature) => (
        <FeatureRow
          key={feature.featureId}
          feature={feature}
          canManage={canManage}
          now={now}
          draft={draft[feature.featureId]}
          onToggle={(enabled) => setEnabled(feature.featureId, enabled)}
          onReasonChange={(reason) => setReason(feature.featureId, reason)}
        />
      )}
    </FeatureGroupList>
  );

  if (!canManage) {
    return body;
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {body}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Button type="submit">Save</Button>
    </form>
  );
}

function FeatureRow({
  feature,
  canManage,
  now,
  draft,
  onToggle,
  onReasonChange,
}: {
  feature: ResolvedFeatureDetail;
  canManage: boolean;
  now: Date;
  draft: Draft | undefined;
  onToggle: (enabled: boolean) => void;
  onReasonChange: (reason: string) => void;
}) {
  const reasonId = `reason-${feature.featureId}`;
  const checked = draft?.enabled ?? feature.enabled;

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-48 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{feature.name}</span>
            <code className="text-muted-foreground text-xs">{feature.key}</code>
            {feature.isPremium && <Badge tone="outline">Premium</Badge>}
          </div>
        </div>

        <Badge tone={feature.enabled ? 'success' : 'outline'}>
          {feature.enabled ? 'On' : 'Off'}
        </Badge>
        <SourceBadge source={feature.source} />

        {canManage && (
          <input
            type="checkbox"
            role="switch"
            aria-checked={checked}
            aria-label={feature.name}
            className="accent-primary h-4 w-4"
            checked={checked}
            onChange={(event) => onToggle(event.target.checked)}
          />
        )}
      </div>

      {feature.source === 'Override' && <OverrideDetails feature={feature} now={now} />}

      {canManage && (
        <div className="max-w-sm">
          <Label htmlFor={reasonId}>Reason for {feature.name}</Label>
          <Input
            id={reasonId}
            value={draft?.reason ?? ''}
            onChange={(event) => onReasonChange(event.target.value)}
          />
        </div>
      )}
    </div>
  );
}

/**
 * The exception's story: who granted it, why, how long ago, and that — unlike the review marker
 * suggests — it never expires on its own. `overrideSetByEmail` is null when the override outlived its
 * author's account; that renders as `(unknown)`, not as a missing row (the exception survives losing
 * its author).
 */
function OverrideDetails({ feature, now }: { feature: ResolvedFeatureDetail; now: Date }) {
  const age = feature.overrideSetAtUtc ? overrideAge(feature.overrideSetAtUtc, now) : null;

  return (
    <div className="text-muted-foreground space-y-1 text-sm">
      {feature.overrideReason && <p>Reason: {feature.overrideReason}</p>}
      <p>Set by {feature.overrideSetByEmail ?? '(unknown)'}</p>
      {age && (
        <p>
          Granted {age.days} {age.days === 1 ? 'day' : 'days'} ago. Does not expire.
        </p>
      )}
      {age?.needsReview && (
        <p className="text-amber-700 dark:text-amber-400">
          Review recommended — overrides never expire on their own, and this one has stood for{' '}
          {age.days} days.
        </p>
      )}
    </div>
  );
}

/**
 * The query container: fetches the resolved catalogue and owns the write. Thin by design — the split
 * with `GymFeaturesList` is what makes the editing behaviour testable without mocking a query hook.
 */
export function GymFeaturesTab({ gymId, canManage }: { gymId: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['gym-features', gymId],
    queryFn: ({ signal }) => gyms.features(gymId, signal),
  });

  const save = useMutation({
    mutationFn: (changes: GymFeatureRequest[]) => gyms.setFeatures(gymId, { features: changes }),
    onSuccess: (resolvedAfter, changes) => {
      // Written straight into the cache, unlike the catalogue's invalidate: this response IS the
      // full resolution and carries no counts to be nulled (D11 does not apply here).
      queryClient.setQueryData(['gym-features', gymId], resolvedAfter);

      // The outcome is read back from the response, never predicted — a change that collapsed
      // into the plan's answer comes back as source: Plan with no override, and that is what the
      // operator is told, not whatever the request assumed it would do.
      const message = resolvedAfter
        .filter((f) => changes.some((c) => c.key === f.key))
        .map((f) => `${f.name} is now ${f.enabled ? 'on' : 'off'} (${f.source})`)
        .join(' · ');

      if (message) {
        toast.success(message);
      }
    },
    onError: (error) => toastApiError(error),
  });

  if (query.isPending) return <Skeleton className="h-64 w-full" aria-busy="true" />;
  if (query.isError) return <ApiErrorText error={query.error} />;

  return (
    <GymFeaturesList
      features={query.data}
      canManage={canManage}
      now={new Date()}
      onSubmit={(changes) => save.mutate(changes)}
    />
  );
}
