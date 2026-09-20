import { Badge } from '@/components/ui/badge';

/**
 * Which layer answered: a stored row beats configuration, which beats the definition's own default
 * (Settings.md §2). Shown on every row because "what is it set to" and "who set it, or did nobody"
 * are the same question when a value surprises an operator. Same tone pattern as `SourceBadge` for
 * features; an unrecognised source still renders its raw value.
 */
const TONES: Record<string, React.ComponentProps<typeof Badge>['tone']> = {
  Database: 'warning',
  Configuration: 'info',
  Default: 'neutral',
};

export function SettingSourceBadge({ source }: { source: string }) {
  return <Badge tone={TONES[source] ?? 'neutral'}>{source}</Badge>;
}
