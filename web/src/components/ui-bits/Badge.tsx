import type { ReactNode } from "react";
import { statusColor, priorityColor, type StatusKey } from "@/lib/colors";

function chip(color: string, children: ReactNode) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wide"
      style={{ backgroundColor: `${color}22`, color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const color = (statusColor as Record<string, string>)[status] ?? "#8AB4C8";
  return chip(color, status.replaceAll("_", " "));
}

export function PriorityBadge({ priority }: { priority: string }) {
  const color = (priorityColor as Record<string, string>)[priority] ?? "#8AB4C8";
  return chip(color, priority);
}

export function Tag({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "brand" }) {
  const style =
    tone === "brand"
      ? { backgroundColor: "var(--color-primary)", color: "var(--color-primary-foreground)" }
      : { backgroundColor: "var(--color-secondary)", color: "var(--color-foreground)" };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium" style={style}>
      {children}
    </span>
  );
}

// suppress unused import warnings
export type { StatusKey };