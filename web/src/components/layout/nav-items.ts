import {
  LayoutDashboard, ListChecks, Users, Factory, Boxes,
  TrendingUp, Wallet, ShoppingCart, ClipboardCheck,
  Settings, Bell, LayoutGrid, Wrench, Truck, Package,
  Newspaper, Store, MessageCircle, BookOpen, UserCircle, Video, CreditCard,
  FlaskConical, Cpu, GitBranch, Landmark, ShieldCheck, ScrollText, Sparkles, KeyRound,
} from "lucide-react";

export type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Optional in-page section hash (department feature menus) */
  hash?: string;
};

// Primary tabs in the mobile bottom nav (max 5). All modules appear in desktop sidebar.
export const PRIMARY_NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/tasks", label: "Tasks", icon: ListChecks },
  { to: "/production", label: "Production", icon: Factory },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/more", label: "More", icon: LayoutGrid },
] as const;

// Enterprise / ERP modules
export const WORKSPACE_NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/tasks", label: "Tasks", icon: ListChecks },
  { to: "/hr", label: "HR", icon: Users },
  { to: "/production", label: "Production", icon: Factory },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/sales", label: "Sales", icon: TrendingUp },
  { to: "/finance", label: "Finance", icon: Wallet },
  { to: "/procurement", label: "Procurement", icon: ShoppingCart },
  { to: "/quality", label: "QA/QC", icon: ClipboardCheck },
  { to: "/crm", label: "CRM", icon: Users },
  { to: "/maintenance", label: "Maintenance", icon: Wrench },
  { to: "/logistics", label: "Logistics", icon: Truck },
  { to: "/stores", label: "Stores", icon: Package },
  { to: "/rnd", label: "R&D", icon: FlaskConical },
  { to: "/it", label: "IT & DT", icon: Cpu },
  { to: "/process", label: "Process Engine", icon: GitBranch },
];

// Consumer / public layer
export const CONSUMER_NAV: NavItem[] = [
  { to: "/feed", label: "Feed", icon: Newspaper },
  { to: "/commerce", label: "Commerce", icon: Store },
  { to: "/media", label: "Media & Live", icon: Video },
  { to: "/payments", label: "Payments & Ads", icon: CreditCard },
  { to: "/chat", label: "Chat", icon: MessageCircle },
  { to: "/customer", label: "Customer", icon: UserCircle },
  { to: "/docs", label: "Docs", icon: BookOpen },
  { to: "/auth-kyc", label: "Auth & KYC", icon: KeyRound },
];

// Admin / governance
export const ADMIN_NAV: NavItem[] = [
  { to: "/governance", label: "Governance", icon: Landmark },
  { to: "/admin", label: "Admin & RBAC", icon: ShieldCheck },
  { to: "/audit", label: "Audit Log", icon: ScrollText },
  { to: "/copilot", label: "AI Copilot", icon: Sparkles },
];

export const SYSTEM_NAV: NavItem[] = [
  { to: "/notifications", label: "Alerts", icon: Bell },
  { to: "/settings", label: "Settings", icon: Settings },
];

// Items shown in the mobile "More" sheet — union of everything not in primary
const primarySet = new Set<string>(PRIMARY_NAV.map((p) => p.to));
export const MORE_NAV: NavItem[] = [
  ...WORKSPACE_NAV.filter((n) => !primarySet.has(n.to)),
  ...CONSUMER_NAV,
  ...ADMIN_NAV,
  ...SYSTEM_NAV,
];

// Flat list used by ⌘K command palette
export const ALL_NAV: NavItem[] = [
  ...WORKSPACE_NAV,
  ...CONSUMER_NAV,
  ...ADMIN_NAV,
  ...SYSTEM_NAV,
];
