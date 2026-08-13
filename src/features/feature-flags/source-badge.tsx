import { Badge } from '@/components/ui/badge';

/**
 * Which of the three layers decided this feature's answer.
 *
 * `override ?? plan ?? platform default` — the source is returned by the API because "is POS on?"
 * and "why is POS on?" are the same question in a support conversation (Features.md).
 *
 * `@/components/ui/badge` is toned rather than variant-based (see `StatusBadge` for the same
 * pattern), so the mapping below picks tones instead of the shadcn `variant` prop the brief
 * sketched — no new UI primitive is introduced. An unrecognised source still renders its raw
 * value, falling back to the neutral tone, rather than being dropped.
 */
const TONES: Record<string, React.ComponentProps<typeof Badge>['tone']> = {
  Override: 'warning',
  Plan: 'info',
  Default: 'neutral',
};

export function SourceBadge({ source }: { source: string }) {
  return <Badge tone={TONES[source] ?? 'neutral'}>{source}</Badge>;
}
