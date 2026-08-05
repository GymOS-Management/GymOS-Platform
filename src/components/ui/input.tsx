import { cn } from '@/lib/utils/cn';

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        // 16px text on mobile: anything smaller makes iOS Safari zoom on focus, which throws the
        // layout the operator was looking at.
        'border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-11 w-full rounded-md border px-3 py-2 text-base focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:text-sm',
        'aria-[invalid=true]:border-destructive',
        className,
      )}
      {...props}
    />
  );
}
