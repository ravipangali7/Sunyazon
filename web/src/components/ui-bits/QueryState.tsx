export function QueryState({
  isLoading,
  isError,
  error,
  empty,
  emptyLabel = "No records yet",
  children,
}: {
  isLoading: boolean;
  isError?: boolean;
  error?: Error | null;
  empty?: boolean;
  emptyLabel?: string;
  children: React.ReactNode;
}) {
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-danger">
        {error?.message || "Failed to load data"}
      </div>
    );
  }
  if (empty) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }
  return <>{children}</>;
}
