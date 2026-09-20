/** One labelled number in a `<dl>` — shared by the process and outbox tiles (Monitoring.md §5–6). */
export function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}
