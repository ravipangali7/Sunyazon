/**
 * Department dashboard sidebar menus, aligned with server/core/models/*.py
 * (see models.md §15–22). When a user is inside a department route, the
 * AppShell shows only that department’s menus — not the full ERP launcher.
 */

import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  UserPlus,
  ClipboardList,
  GraduationCap,
  CalendarCheck,
  CalendarOff,
  Wallet,
  BookOpen,
  FileText,
  Banknote,
  Receipt,
  CreditCard,
  TrendingUp,
  TrendingDown,
  PieChart,
  ScrollText,
  Factory,
  GitBranch,
  Boxes,
  Warehouse,
  Package,
  ArrowLeftRight,
  ShoppingCart,
  Truck,
  ClipboardCheck,
  FlaskConical,
  Handshake,
  AlertTriangle,
  Wrench,
  Cog,
  Landmark,
  ShieldCheck,
  Sparkles,
  Newspaper,
  Store,
  Video,
  MessageCircle,
  UserCircle,
  KeyRound,
  ListChecks,
  Route,
  MapPin,
  Car,
  Tags,
  Beaker,
} from "lucide-react";
import type { NavItem } from "@/components/layout/nav-items";

export type DepartmentMenuItem = NavItem & {
  /** Optional hash for in-page section anchors */
  hash?: string;
  id: string;
};

export type DepartmentScope = {
  /** Module code used for auth.hasModule checks */
  code: string;
  /** Related module codes that also grant access (e.g. inventory+stores) */
  relatedCodes: string[];
  label: string;
  groupLabel: string;
  /** Primary home route for this department */
  home: string;
  items: DepartmentMenuItem[];
};

function item(
  id: string,
  label: string,
  to: string,
  icon: LucideIcon,
  hash?: string,
): DepartmentMenuItem {
  return { id, label, to, icon, hash };
}

/** Path → department feature menus (model-driven). */
export const DEPARTMENT_SCOPES: Record<string, DepartmentScope> = {
  "/hr": {
    code: "hr",
    relatedCodes: ["hr"],
    label: "HR",
    groupLabel: "HR & People",
    home: "/hr",
    items: [
      item("overview", "Overview", "/hr", LayoutDashboard),
      item("positions", "Positions", "/hr", Briefcase, "positions"),
      item("employees", "Employees", "/hr", Users, "employees"),
      item("vacancies", "Vacancies", "/hr", UserPlus, "vacancies"),
      item("applicants", "Applicants", "/hr", ClipboardList, "applicants"),
      item("onboarding", "Onboarding", "/hr", ListChecks, "onboarding"),
      item("training", "Training", "/hr", GraduationCap, "training"),
      item("attendance", "Attendance", "/hr", CalendarCheck, "attendance"),
      item("leave", "Leave", "/hr", CalendarOff, "leave"),
      item("payroll", "Payroll", "/hr", Wallet, "payroll"),
    ],
  },
  "/finance": {
    code: "finance",
    relatedCodes: ["finance"],
    label: "Finance",
    groupLabel: "Finance & Accounts",
    home: "/finance",
    items: [
      item("overview", "Overview", "/finance", LayoutDashboard),
      item("coa", "Chart of Accounts", "/finance", BookOpen, "coa"),
      item("vouchers", "Journal Vouchers", "/finance", FileText, "vouchers"),
      item("cashbank", "Cash & Bank", "/finance", Banknote, "cashbank"),
      item("daybook", "Day Book", "/finance", Receipt, "daybook"),
      item("ledger", "Ledger", "/finance", ScrollText, "ledger"),
      item("purchase", "Purchase Docs", "/finance", ShoppingCart, "purchase"),
      item("sales", "Sales Docs", "/finance", TrendingUp, "sales-docs"),
      item("payments", "Payments / Receipts", "/finance", CreditCard, "payments"),
      item("notes", "Debit / Credit Notes", "/finance", FileText, "notes"),
      item("income", "Income & Expenses", "/finance", TrendingDown, "income"),
      item("pnl", "Profit & Loss", "/finance", PieChart, "pnl"),
      item("tax", "Tax & Audit", "/finance", Landmark, "tax"),
      item("cheques", "Issue Cheques", "/finance", Receipt, "cheques"),
    ],
  },
  "/sales": {
    code: "sales",
    relatedCodes: ["sales"],
    label: "Sales",
    groupLabel: "Sales",
    home: "/sales",
    items: [
      item("overview", "Overview", "/sales", LayoutDashboard),
      item("parties", "Parties", "/sales", Handshake, "parties"),
      item("territories", "Territories", "/sales", MapPin, "territories"),
      item("asm", "ASM Orders", "/sales", TrendingUp, "asm"),
      item("dealer", "Dealer Orders", "/sales", Store, "dealer"),
      item("retail", "Retail Orders", "/sales", Tags, "retail"),
      item("returns", "Returns", "/sales", ArrowLeftRight, "returns"),
      item("schemes", "Promotion Schemes", "/sales", Sparkles, "schemes"),
    ],
  },
  "/logistics": {
    code: "logistics",
    relatedCodes: ["logistics"],
    label: "Logistics",
    groupLabel: "Logistics & Dispatch",
    home: "/logistics",
    items: [
      item("overview", "Overview", "/logistics", LayoutDashboard),
      item("vehicles", "Vehicles", "/logistics", Car, "vehicles"),
      item("routes", "Routes", "/logistics", Route, "routes"),
      item("dispatch", "Dispatch", "/logistics", Truck, "dispatch"),
      item("pod", "Proof of Delivery", "/logistics", ClipboardCheck, "pod"),
    ],
  },
  "/production": {
    code: "production",
    relatedCodes: ["production", "process"],
    label: "Production",
    groupLabel: "Production",
    home: "/production",
    items: [
      item("overview", "Overview", "/production", LayoutDashboard),
      item("bom", "BOM & Recipes", "/production", Beaker, "bom"),
      item("batches", "Batches", "/production", Package, "batches"),
      item("workorders", "Work Orders", "/production", Factory, "workorders"),
      item("runs", "Process Runs", "/process", GitBranch),
      item("wip", "WIP Tracking", "/production", Cog, "wip"),
      item("costing", "Production Costing", "/production", PieChart, "costing"),
      item("damage", "Damage / Expire", "/production", AlertTriangle, "damage"),
      item("reports", "Working Reports", "/production", FileText, "reports"),
    ],
  },
  "/process": {
    code: "process",
    relatedCodes: ["process", "production"],
    label: "Process Engine",
    groupLabel: "Process Engine",
    home: "/process",
    items: [
      item("overview", "Overview", "/process", LayoutDashboard),
      item("templates", "Industry Templates", "/process", BookOpen, "templates"),
      item("definitions", "Process Definitions", "/process", GitBranch, "definitions"),
      item("stages", "Stages & Fields", "/process", ListChecks, "stages"),
      item("workorders", "Work Orders", "/production", Factory),
      item("runs", "Process Runs", "/process", Cog, "runs"),
    ],
  },
  "/inventory": {
    code: "inventory",
    relatedCodes: ["inventory", "stores"],
    label: "Inventory",
    groupLabel: "Inventory",
    home: "/inventory",
    items: [
      item("overview", "Overview", "/inventory", LayoutDashboard),
      item("warehouses", "Warehouses", "/inventory", Warehouse, "warehouses"),
      item("items", "Item Master", "/inventory", Package, "items"),
      item("stock", "Stock Ledger", "/inventory", Boxes, "stock"),
      item("grn", "Goods Receipt (GRN)", "/inventory", ClipboardCheck, "grn"),
      item("adjust", "Stock Adjustments", "/inventory", ArrowLeftRight, "adjust"),
      item("issues", "Material Issues", "/inventory", Package, "issues"),
    ],
  },
  "/stores": {
    code: "stores",
    relatedCodes: ["stores", "inventory"],
    label: "Stores",
    groupLabel: "Stores",
    home: "/stores",
    items: [
      item("overview", "Overview", "/stores", LayoutDashboard),
      item("issues", "Material Issues", "/stores", Package, "issues"),
      item("grn", "Goods Receipt", "/stores", ClipboardCheck, "grn"),
      item("stock", "Stock Levels", "/stores", Boxes, "stock"),
      item("movements", "Stock Movements", "/stores", ArrowLeftRight, "movements"),
    ],
  },
  "/procurement": {
    code: "procurement",
    relatedCodes: ["procurement"],
    label: "Procurement",
    groupLabel: "Procurement",
    home: "/procurement",
    items: [
      item("overview", "Overview", "/procurement", LayoutDashboard),
      item("vendors", "Vendors", "/procurement", Handshake, "vendors"),
      item("pr", "Purchase Requisitions", "/procurement", ClipboardList, "pr"),
      item("rfq", "RFQ / Quotations", "/procurement", FileText, "rfq"),
      item("po", "Purchase Orders", "/procurement", ShoppingCart, "po"),
      item("grn", "Goods Receipt", "/procurement", ClipboardCheck, "grn"),
    ],
  },
  "/quality": {
    code: "quality",
    relatedCodes: ["quality"],
    label: "QA/QC",
    groupLabel: "Quality",
    home: "/quality",
    items: [
      item("overview", "Overview", "/quality", LayoutDashboard),
      item("incoming", "Incoming Inspection", "/quality", ClipboardCheck, "incoming"),
      item("processqc", "In-Process QC", "/quality", Cog, "processqc"),
      item("release", "Final QA Release", "/quality", ShieldCheck, "release"),
      item("lab", "Lab Reports", "/quality", FlaskConical, "lab"),
      item("ncr", "NCR", "/quality", AlertTriangle, "ncr"),
      item("capa", "CAPA", "/quality", ListChecks, "capa"),
      item("masters", "Quality Masters", "/quality", BookOpen, "masters"),
    ],
  },
  "/crm": {
    code: "crm",
    relatedCodes: ["crm"],
    label: "CRM",
    groupLabel: "CRM",
    home: "/crm",
    items: [
      item("overview", "Overview", "/crm", LayoutDashboard),
      item("pipeline", "Sales Pipeline", "/crm", TrendingUp, "pipeline"),
      item("complaints", "Complaints", "/crm", AlertTriangle, "complaints"),
      item("activities", "Customer Activities", "/crm", CalendarCheck, "activities"),
    ],
  },
  "/maintenance": {
    code: "maintenance",
    relatedCodes: ["maintenance"],
    label: "Maintenance",
    groupLabel: "Maintenance",
    home: "/maintenance",
    items: [
      item("overview", "Overview", "/maintenance", LayoutDashboard),
      item("equipment", "Equipment", "/maintenance", Cog, "equipment"),
      item("pm", "PM Schedules", "/maintenance", CalendarCheck, "pm"),
      item("workorders", "Work Orders", "/maintenance", Wrench, "workorders"),
      item("calibration", "Calibration", "/maintenance", ClipboardCheck, "calibration"),
    ],
  },
  "/rnd": {
    code: "rnd",
    relatedCodes: ["rnd"],
    label: "R&D",
    groupLabel: "R&D",
    home: "/rnd",
    items: [
      item("overview", "Overview", "/rnd", LayoutDashboard),
      item("projects", "Projects", "/rnd", Sparkles, "projects"),
      item("trials", "Trial Batches", "/rnd", Beaker, "trials"),
      item("definitions", "Process Definitions", "/rnd", FlaskConical, "definitions"),
    ],
  },
  "/it": {
    code: "it",
    relatedCodes: ["it"],
    label: "IT & DT",
    groupLabel: "IT & Digital",
    home: "/it",
    items: [
      item("overview", "Overview", "/it", LayoutDashboard),
      item("helpdesk", "Helpdesk", "/it", MessageCircle, "helpdesk"),
      item("access", "Access & Sessions", "/it", KeyRound, "access"),
    ],
  },
  "/governance": {
    code: "governance",
    relatedCodes: ["governance"],
    label: "Governance",
    groupLabel: "Governance",
    home: "/governance",
    items: [
      item("overview", "Overview", "/governance", LayoutDashboard),
      item("board", "Board Portal", "/governance", Landmark, "board"),
      item("doa", "Delegation of Authority", "/governance", ShieldCheck, "doa"),
      item("meetings", "Meetings", "/governance", Users, "meetings"),
    ],
  },
  "/admin": {
    code: "admin",
    relatedCodes: ["admin"],
    label: "Admin",
    groupLabel: "Admin & RBAC",
    home: "/admin",
    items: [
      item("overview", "Overview", "/admin", LayoutDashboard),
      item("users", "Users & Roles", "/admin", Users, "users"),
      item("modules", "Modules", "/admin", Boxes, "modules"),
      item("org", "Organization", "/settings", Landmark),
      item("audit", "Audit Log", "/audit", ScrollText),
    ],
  },
  "/audit": {
    code: "audit",
    relatedCodes: ["audit", "admin"],
    label: "Audit",
    groupLabel: "Audit",
    home: "/audit",
    items: [
      item("overview", "Overview", "/audit", LayoutDashboard),
      item("trail", "Change Trail", "/audit", ScrollText, "trail"),
      item("admin", "Admin & RBAC", "/admin", ShieldCheck),
    ],
  },
  "/copilot": {
    code: "copilot",
    relatedCodes: ["copilot"],
    label: "AI Copilot",
    groupLabel: "AI Copilot",
    home: "/copilot",
    items: [
      item("overview", "Ask BEOS", "/copilot", Sparkles),
      item("insights", "AI Insights", "/copilot", PieChart, "insights"),
    ],
  },
  "/feed": {
    code: "feed",
    relatedCodes: ["feed"],
    label: "Feed",
    groupLabel: "Social Feed",
    home: "/feed",
    items: [
      item("overview", "Overview", "/feed", LayoutDashboard),
      item("posts", "Posts", "/feed", Newspaper, "posts"),
      item("stories", "Stories", "/feed", Video, "stories"),
    ],
  },
  "/commerce": {
    code: "commerce",
    relatedCodes: ["commerce", "marketing"],
    label: "Commerce",
    groupLabel: "E-commerce",
    home: "/commerce",
    items: [
      item("overview", "Overview", "/commerce", LayoutDashboard),
      item("products", "Products", "/commerce", Package, "products"),
      item("orders", "Orders", "/commerce", ShoppingCart, "orders"),
      item("catalog", "Catalog", "/commerce", Tags, "catalog"),
    ],
  },
  "/media": {
    code: "media",
    relatedCodes: ["media"],
    label: "Media",
    groupLabel: "Media & Live",
    home: "/media",
    items: [
      item("overview", "Overview", "/media", LayoutDashboard),
      item("assets", "Media Assets", "/media", Video, "assets"),
      item("live", "Live Streams", "/media", Video, "live"),
      item("playlists", "Playlists", "/media", ListChecks, "playlists"),
    ],
  },
  "/payments": {
    code: "payments",
    relatedCodes: ["payments"],
    label: "Payments",
    groupLabel: "Payments & Ads",
    home: "/payments",
    items: [
      item("overview", "Overview", "/payments", LayoutDashboard),
      item("txns", "Transactions", "/payments", CreditCard, "txns"),
      item("ads", "Ad Campaigns", "/payments", Sparkles, "ads"),
    ],
  },
  "/chat": {
    code: "chat",
    relatedCodes: ["chat"],
    label: "Chat",
    groupLabel: "Chat Centre",
    home: "/chat",
    items: [
      item("overview", "Threads", "/chat", MessageCircle),
      item("calls", "Calls", "/chat", Video, "calls"),
      item("help", "Help Tickets", "/chat", AlertTriangle, "help"),
    ],
  },
  "/customer": {
    code: "customer",
    relatedCodes: ["customer"],
    label: "Customer",
    groupLabel: "Customer Portal",
    home: "/customer",
    items: [
      item("overview", "Overview", "/customer", LayoutDashboard),
      item("profile", "My Profile", "/customer", UserCircle, "profile"),
      item("orders", "My Orders", "/commerce", ShoppingCart),
      item("nearest", "Nearest Shops", "/customer", MapPin, "nearest"),
    ],
  },
  "/docs": {
    code: "docs",
    relatedCodes: ["docs"],
    label: "Docs",
    groupLabel: "Documentation",
    home: "/docs",
    items: [
      item("overview", "Overview", "/docs", LayoutDashboard),
      item("templates", "Templates", "/docs", FileText, "templates"),
      item("library", "Document Library", "/docs", BookOpen, "library"),
    ],
  },
  "/auth-kyc": {
    code: "auth-kyc",
    relatedCodes: ["auth-kyc", "customer"],
    label: "Auth & KYC",
    groupLabel: "Identity",
    home: "/auth-kyc",
    items: [
      item("overview", "Overview", "/auth-kyc", LayoutDashboard),
      item("kyc", "KYC Documents", "/auth-kyc", KeyRound, "kyc"),
      item("address", "Addresses", "/auth-kyc", MapPin, "address"),
    ],
  },
  "/tasks": {
    code: "tasks",
    relatedCodes: ["tasks", "dashboard"],
    label: "Tasks",
    groupLabel: "My Work",
    home: "/tasks",
    items: [
      item("overview", "Task Queue", "/tasks", ListChecks),
      item("approvals", "Approvals", "/tasks", ShieldCheck, "approvals"),
      item("mission", "Today’s Mission", "/", LayoutDashboard),
      item("alerts", "Alerts", "/notifications", AlertTriangle),
    ],
  },
};

/** Longest-prefix match so `/hr/foo` still resolves to HR if nested later. */
export function resolveDepartmentScope(pathname: string): DepartmentScope | null {
  if (!pathname || pathname === "/") return null;
  const exact = DEPARTMENT_SCOPES[pathname];
  if (exact) return exact;
  const match = Object.keys(DEPARTMENT_SCOPES)
    .filter((p) => pathname === p || pathname.startsWith(`${p}/`))
    .sort((a, b) => b.length - a.length)[0];
  return match ? DEPARTMENT_SCOPES[match] : null;
}

export function departmentItemsToNav(scope: DepartmentScope): NavItem[] {
  return scope.items.map(({ to, label, icon }) => ({ to, label, icon }));
}
