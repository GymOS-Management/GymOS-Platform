import type { LucideIcon } from 'lucide-react';

/**
 * An empty list explains itself. "No gyms match these filters" and "no gyms exist yet — provision the
 * first one" are different situations needing different next actions, and a bare empty table tells the
 * operator neither.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed px-6 py-12 text-center">
      <Icon className="text-muted-foreground h-8 w-8" aria-hidden />
      <p className="font-medium">{title}</p>
      {description && <p className="text-muted-foreground max-w-sm text-sm">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
