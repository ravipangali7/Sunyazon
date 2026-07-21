import {
  LayoutDashboard, ListChecks, Users, Factory, Boxes,
  TrendingUp, Wallet, ShoppingCart, ClipboardCheck,
  Settings, Bell, Wrench, Truck, Package,
  Newspaper, Store, MessageCircle, BookOpen, UserCircle, Video, CreditCard,
  FlaskConical, Cpu, GitBranch, Landmark, ShieldCheck, ScrollText, Sparkles, KeyRound,
  Megaphone, LayoutGrid, type LucideIcon,
} from "lucide-react";
import type { ModuleAccess } from "@/lib/auth";
import type { NavItem } from "@/components/layout/nav-items";

const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  ListChecks,
  Users,
  Factory,
  Boxes,
  TrendingUp,
  Wallet,
  ShoppingCart,
  ClipboardCheck,
  Settings,
  Bell,
  Wrench,
  Truck,
  Package,
  Newspaper,
  Store,
  MessageCircle,
  BookOpen,
  UserCircle,
  Video,
  CreditCard,
  FlaskConical,
  Cpu,
  GitBranch,
  Landmark,
  ShieldCheck,
  ScrollText,
  Sparkles,
  KeyRound,
  Megaphone,
  LayoutGrid,
};

export function resolveModuleIcon(name?: string): LucideIcon {
  if (!name) return LayoutGrid;
  return ICON_MAP[name] || LayoutGrid;
}

export function modulesToNav(modules: ModuleAccess[]): NavItem[] {
  return modules.map((m) => ({
    to: m.route_path,
    label: m.name,
    icon: resolveModuleIcon(m.icon),
  }));
}

export function groupModules(modules: ModuleAccess[]) {
  const groups: Record<string, ModuleAccess[]> = {
    workspace: [],
    consumer: [],
    admin: [],
    system: [],
  };
  for (const m of modules) {
    const key = groups[m.category] ? m.category : "workspace";
    groups[key].push(m);
  }
  return groups;
}
