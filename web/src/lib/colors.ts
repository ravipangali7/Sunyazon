/**
 * Sunyazon / BEOS — Single source of truth for colors.
 * Aligned with design.md §2 (Vibrant Tangerine variant).
 *
 * Rule: components must NEVER hardcode hex/rgb; import from here
 * or use the semantic Tailwind tokens that mirror these values in styles.css.
 */

export const brand = {
  primary: "#FF7A00",
  primaryHover: "#FF8F26",
  primaryPressed: "#E56A00",
  primarySoft: "rgba(255, 122, 0, 0.14)",
  primaryRing: "rgba(255, 122, 0, 0.45)",
  accent: "#FFB347",
  // Sub-brands (chip accents)
  laija: "#F25C05",
  royal: "#B8860B",
  suya: "#2E8B57",
  navara: "#4B6CB7",
} as const;

export const dark = {
  bgApp: "#000000",
  bgElevated: "#0A0A0A",
  surface: "#121212",
  surface2: "#1A1A1A",
  surface3: "#242424",
  overlay: "rgba(0,0,0,0.72)",
  fgPrimary: "#FFFFFF",
  fgSecondary: "#B3B3B3",
  fgTertiary: "#8A8A8A",
  fgDisabled: "#555555",
  borderSubtle: "#2A2A2A",
  borderStrong: "#3D3D3D",
  separator: "#1F1F1F",
} as const;

export const light = {
  bgApp: "#FFFFFF",
  bgElevated: "#FFFFFF",
  surface: "#F7F7F8",
  surface2: "#FFFFFF",
  surface3: "#EEEEF0",
  overlay: "rgba(0,0,0,0.40)",
  fgPrimary: "#111114",
  fgSecondary: "#5C5C5C",
  fgTertiary: "#8E8E93",
  fgDisabled: "#C7C7CC",
  borderSubtle: "#E5E5EA",
  borderStrong: "#D1D1D6",
  separator: "#E5E5EA",
} as const;

export const semantic = {
  success: { dark: "#30D158", light: "#34C759" },
  warning: { dark: "#FFD60A", light: "#FF9F0A" },
  danger: { dark: "#FF453A", light: "#FF3B30" },
  info: { dark: "#64D2FF", light: "#007AFF" },
} as const;

// Chart series (per design.md §2.4) — brand orange first, then cool greys/teal
export const chartSeries = [
  "#FF7A00", // series 1: brand
  "#8AB4C8", // series 2: steel
  "#4FB3A9", // series 3: muted teal
  "#B8B8C0", // series 4: cool grey
  "#5C6773", // series 5: slate
] as const;

// Status → color mapping (workflow / task lifecycle)
export const statusColor = {
  new: "#8AB4C8",
  assigned: "#8AB4C8",
  in_progress: "#FF7A00",
  pending_approval: "#FF9F0A",
  completed: "#34C759",
  verified: "#30D158",
  rejected: "#FF3B30",
  overdue: "#FF3B30",
  on_hold: "#FFD60A",
} as const;

export const priorityColor = {
  low: "#8AB4C8",
  medium: "#FF9F0A",
  high: "#FF7A00",
  critical: "#FF3B30",
} as const;

export type StatusKey = keyof typeof statusColor;
export type PriorityKey = keyof typeof priorityColor;