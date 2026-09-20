'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApiErrorText } from '@/components/feedback/api-error-text';
import { PageHeader } from '@/components/layout/page-header';
import { SettingsCategoryForm } from '@/features/settings/settings-category-form';
import { TestEmailCard } from '@/features/settings/test-email-card';
import { settings } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/problems';
import { usePermission } from '@/lib/auth/session';
import { settingsFingerprint } from '@/lib/settings/diff';
import type { SettingCategory, SettingValueWrite, SmtpConnectionTestResult } from '@/types/api';

/** The tabs. Maintenance is deliberately absent — it has its own section and its own endpoint (D7). */
const TABS: SettingCategory[] = ['General', 'Email', 'Security', 'Retention'];

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Every declared setting, its effective value, and which layer decided it. A stored value beats configuration, which beats the default."
      />
      <Tabs defaultValue="General">
        <TabsList aria-label="Setting categories">
          {TABS.map((category) => (
            <TabsTrigger key={category} value={category}>
              {category}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((category) => (
          <TabsContent key={category} value={category} className="space-y-6">
            <SettingsCategoryPanel category={category} />
            {category === 'Email' && <TestEmailPanel />}
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}

/**
 * One category: read, save the diff, replace the cache with the response.
 *
 * A 409 means another administrator's write raced this one on the same row version (Settings.md §5).
 * The operator is told so and the category is re-read; their draft is lost, which is the honest
 * outcome — reapplying it blind would be the last-write-wins the row version exists to prevent.
 */
export function SettingsCategoryPanel({ category }: { category: SettingCategory }) {
  const canManage = usePermission('settings.manage');
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['settings', category],
    queryFn: ({ signal }) => settings.list(category, signal),
  });

  const save = useMutation({
    mutationFn: (values: SettingValueWrite[]) => settings.update({ category, values }),
    onSuccess: (fresh) => {
      queryClient.setQueryData(['settings', category], fresh);
      toast.success('Settings saved.');
    },
    onError: (error) => {
      if (error instanceof ApiError && error.isConflict) {
        toast.error('Another administrator saved first. The latest values have been reloaded.');
        void queryClient.invalidateQueries({ queryKey: ['settings', category] });
        return;
      }
      // Anything else stays in the form beside Save (settings.invalid_value names the key).
    },
  });

  if (query.isPending) {
    return <Skeleton className="h-48 w-full" aria-busy="true" />;
  }

  if (query.isError) {
    return <ApiErrorText error={query.error} />;
  }

  return (
    <SettingsCategoryForm
      key={settingsFingerprint(query.data)}
      settings={query.data}
      canManage={canManage}
      busy={save.isPending}
      error={save.error instanceof ApiError && save.error.isConflict ? null : save.error}
      onSave={(changes) => save.mutate(changes)}
    />
  );
}

function TestEmailPanel() {
  const canManage = usePermission('settings.manage');
  const [result, setResult] = useState<SmtpConnectionTestResult | null>(null);
  const probe = useMutation({
    mutationFn: () => settings.testEmail(),
    onSuccess: setResult,
    onError: () => setResult(null),
  });

  return (
    <TestEmailCard
      canManage={canManage}
      result={result}
      busy={probe.isPending}
      error={probe.error}
      onTest={() => probe.mutate()}
    />
  );
}
