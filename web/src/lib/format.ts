/**
 * SSR-safe formatting helpers.
 * Dates: both server and client must produce the same string during hydration,
 * so use UTC / fixed locale.
 */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "2-digit", year: "numeric" });
}

export function fmtNPR(n: number): string {
  if (n >= 1_000_000) return `Rs ${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `Rs ${(n / 1_000).toFixed(1)}K`;
  return `Rs ${n}`;
}
