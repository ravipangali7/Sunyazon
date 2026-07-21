/**
 * Role-scoped ERP module + feature catalog for account-type portals.
 * Inspired by Odoo / distribution ERP layouts; filtered per business role.
 */

import type { LucideIcon } from "lucide-react";
import {
  Factory,
  Truck,
  Warehouse,
  Store,
  ShoppingCart,
  TrendingUp,
  Wallet,
  Boxes,
  ClipboardCheck,
  Users,
  Wrench,
  Package,
  FlaskConical,
  Megaphone,
  ShieldCheck,
  ListChecks,
  Handshake,
  Building2,
  ScanBarcode,
  Tags,
  Route,
  UserPlus,
  Cpu,
  Landmark,
  Sparkles,
} from "lucide-react";

export type PortalAccountType = "producer" | "distributor" | "wholesaler" | "retailer";

export type PortalFeature = {
  id: string;
  label: string;
  description: string;
  /** Existing app route when available */
  to: string;
  /** Optional in-page section hash */
  hash?: string;
};

export type PortalModule = {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  color: string;
  /** Module home route */
  to: string;
  /** Module codes used for auth.hasModule filtering */
  moduleCodes: string[];
  features: PortalFeature[];
};

export type PortalMeta = {
  type: PortalAccountType;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  accent: string;
  /** KPI labels only — values come from live /dashboard/ */
  kpis: { label: string; key: string; hint: string }[];
  modules: PortalModule[];
};

const SHARED_ADMIN: PortalModule = {
  id: "admin",
  name: "Admin & Access",
  description: "Users, roles, and organization settings",
  icon: ShieldCheck,
  color: "#F25C05",
  to: "/admin",
  moduleCodes: ["admin"],
  features: [
    { id: "users", label: "Users & Staff", description: "Invite and manage team members", to: "/admin" },
    { id: "roles", label: "Roles & Permissions", description: "Module access (F / R / N)", to: "/admin" },
    { id: "org", label: "Organization Profile", description: "Branches, warehouses, KYC", to: "/settings" },
    { id: "audit", label: "Audit Log", description: "Change history and compliance trail", to: "/audit" },
  ],
};

const SHARED_TASKS: PortalModule = {
  id: "work",
  name: "My Work",
  description: "Missions, tasks, and approvals",
  icon: ListChecks,
  color: "#FF6F1F",
  to: "/tasks",
  moduleCodes: ["dashboard", "tasks"],
  features: [
    { id: "mission", label: "Today’s Mission", description: "Priority work for your role", to: "/" },
    { id: "tasks", label: "Task Queue", description: "Assigned and overdue work", to: "/tasks" },
    { id: "approvals", label: "Approvals Inbox", description: "Pending authorizations", to: "/tasks" },
    { id: "alerts", label: "Alerts", description: "Stock, credit, and SLA warnings", to: "/notifications" },
  ],
};

const SHARED_HR_LIGHT: PortalModule = {
  id: "hr",
  name: "HR",
  description: "People, attendance, and payroll",
  icon: Users,
  color: "#0EA5E9",
  to: "/hr",
  moduleCodes: ["hr"],
  features: [
    { id: "employees", label: "Employees", description: "Staff directory and positions", to: "/hr" },
    { id: "attendance", label: "Attendance", description: "Shifts, OT, and presence", to: "/hr" },
    { id: "leave", label: "Leave", description: "Requests and approvals", to: "/hr" },
    { id: "payroll", label: "Payroll", description: "Run and approve payroll", to: "/hr" },
  ],
};

const SHARED_FINANCE: PortalModule = {
  id: "finance",
  name: "Finance",
  description: "Cash, ledgers, AP/AR, and reports",
  icon: Wallet,
  color: "#8B5CF6",
  to: "/finance",
  moduleCodes: ["finance"],
  features: [
    { id: "cashbank", label: "Cash & Bank", description: "Balances and day book", to: "/finance" },
    { id: "vouchers", label: "Vouchers", description: "Journal, receipt, payment", to: "/finance" },
    { id: "ap", label: "Accounts Payable", description: "Supplier invoices and payments", to: "/finance" },
    { id: "ar", label: "Accounts Receivable", description: "Customer invoices and collection", to: "/finance" },
    { id: "tax", label: "Tax (VAT / TDS)", description: "Deductions and returns", to: "/finance" },
    { id: "pnl", label: "P&L / Reports", description: "Income, expense, analytics", to: "/finance" },
  ],
};

const SHARED_CRM: PortalModule = {
  id: "crm",
  name: "CRM",
  description: "Pipeline, parties, and complaints",
  icon: Handshake,
  color: "#6366F1",
  to: "/crm",
  moduleCodes: ["crm"],
  features: [
    { id: "parties", label: "Customers & Parties", description: "Credit limits and territories", to: "/crm" },
    { id: "pipeline", label: "Sales Pipeline", description: "Leads → deals → won", to: "/crm" },
    { id: "complaints", label: "Complaints", description: "Register → CAPA → close", to: "/crm" },
    { id: "followup", label: "Follow-ups", description: "Activities and reminders", to: "/crm" },
  ],
};

const PRODUCER_MODULES: PortalModule[] = [
  SHARED_TASKS,
  {
    id: "production",
    name: "Production",
    description: "MRP, batches, work orders, and shop floor",
    icon: Factory,
    color: "#F59E0B",
    to: "/production",
    moduleCodes: ["production", "process"],
    features: [
      { id: "bom", label: "BOM & Recipes", description: "Bills of materials and formulas", to: "/production" },
      { id: "planning", label: "Production Planning", description: "Demand vs capacity plans", to: "/production" },
      { id: "wo", label: "Work Orders", description: "Release, start, and complete WOs", to: "/production" },
      { id: "batches", label: "Batch Records", description: "Batch numbers, yield, traceability", to: "/production" },
      { id: "process", label: "Process Runs", description: "Stage canvas and bottlenecks", to: "/process" },
      { id: "oee", label: "OEE & Downtime", description: "Line performance monitoring", to: "/production" },
    ],
  },
  {
    id: "procurement",
    name: "Purchase",
    description: "Vendors, PR, PO, and inbound receiving",
    icon: ShoppingCart,
    color: "#EC4899",
    to: "/procurement",
    moduleCodes: ["procurement"],
    features: [
      { id: "vendors", label: "Vendors", description: "Supplier master and evaluation", to: "/procurement", hash: "vendors" },
      { id: "pr", label: "Purchase Requisitions", description: "Request → approve → PO", to: "/procurement", hash: "pr" },
      { id: "rfq", label: "RFQ / Quotations", description: "Compare supplier quotes", to: "/procurement", hash: "rfq" },
      { id: "po", label: "Purchase Orders", description: "Send, track, and close POs", to: "/procurement", hash: "po" },
      { id: "grn", label: "Goods Receipt (GRN)", description: "Receive against PO", to: "/procurement", hash: "grn" },
      { id: "import", label: "Import / LC", description: "Letters of credit and shipment", to: "/procurement" },
    ],
  },
  {
    id: "inventory",
    name: "Inventory & Stores",
    description: "Warehouses, stock, FEFO, and issues",
    icon: Boxes,
    color: "#10B981",
    to: "/inventory",
    moduleCodes: ["inventory", "stores"],
    features: [
      { id: "stock", label: "Stock Levels", description: "Multi-location on-hand", to: "/inventory" },
      { id: "warehouses", label: "Warehouses", description: "Plant, FG, and RM locations", to: "/inventory" },
      { id: "fefo", label: "FEFO / Expiry", description: "Expiry-based picking rules", to: "/inventory" },
      { id: "issue", label: "Material Issue", description: "Issue to production lines", to: "/stores" },
      { id: "adjust", label: "Adjustments & Audit", description: "Variance and stock count", to: "/inventory" },
      { id: "damage", label: "Damage / Expire", description: "Write-offs and scrap", to: "/inventory" },
    ],
  },
  {
    id: "quality",
    name: "QA / QC",
    description: "Incoming, process, and final release",
    icon: ClipboardCheck,
    color: "#14B8A6",
    to: "/quality",
    moduleCodes: ["quality"],
    features: [
      { id: "incoming", label: "Incoming Inspection", description: "Material QC at gate", to: "/quality#incoming" },
      { id: "processqc", label: "Process QC", description: "In-line checks and sheets", to: "/quality#processqc" },
      { id: "release", label: "Final Release", description: "FG batch release gate", to: "/quality#release" },
      { id: "ncr", label: "NCR & CAPA", description: "Non-conformance and corrective action", to: "/quality#ncr" },
      { id: "lab", label: "Laboratory", description: "Test records and calibration", to: "/quality#lab" },
    ],
  },
  {
    id: "sales",
    name: "Sales",
    description: "Orders to distributors and key accounts",
    icon: TrendingUp,
    color: "#EF4444",
    to: "/sales",
    moduleCodes: ["sales"],
    features: [
      { id: "quotes", label: "Quotations", description: "Quote → approve → send", to: "/sales" },
      { id: "so", label: "Sales Orders", description: "Order booking and verification", to: "/sales" },
      { id: "pricelist", label: "Pricelists", description: "Channel and volume pricing", to: "/sales" },
      { id: "distributors", label: "Distributor Network", description: "Appointments and agreements", to: "/sales" },
      { id: "schemes", label: "Trade Schemes", description: "Promos and rebates", to: "/sales" },
      { id: "targets", label: "Targets", description: "Territory and brand targets", to: "/sales" },
    ],
  },
  {
    id: "logistics",
    name: "Logistics",
    description: "Dispatch, trips, and proof of delivery",
    icon: Truck,
    color: "#F97316",
    to: "/logistics",
    moduleCodes: ["logistics"],
    features: [
      { id: "dispatch", label: "Dispatch Notes", description: "Pick → pack → ship", to: "/logistics" },
      { id: "trips", label: "Trips & Routes", description: "Vehicle and route planning", to: "/logistics" },
      { id: "pod", label: "Proof of Delivery", description: "POD capture and exceptions", to: "/logistics" },
      { id: "otif", label: "OTIF Tracking", description: "On-time in-full metrics", to: "/logistics" },
    ],
  },
  SHARED_FINANCE,
  SHARED_CRM,
  {
    id: "maintenance",
    name: "Maintenance",
    description: "PM, breakdowns, and calibration",
    icon: Wrench,
    color: "#64748B",
    to: "/maintenance",
    moduleCodes: ["maintenance"],
    features: [
      { id: "pm", label: "Preventive Maintenance", description: "Schedules and due WOs", to: "/maintenance" },
      { id: "breakdown", label: "Breakdowns", description: "Report → repair → release", to: "/maintenance" },
      { id: "spares", label: "Spare Parts", description: "Min stock and reorder", to: "/maintenance" },
      { id: "calibration", label: "Calibration", description: "Instrument calibration log", to: "/maintenance" },
    ],
  },
  SHARED_HR_LIGHT,
  {
    id: "rnd",
    name: "R&D",
    description: "Ideas, trials, and shelf-life studies",
    icon: FlaskConical,
    color: "#A855F7",
    to: "/rnd",
    moduleCodes: ["rnd"],
    features: [
      { id: "ideas", label: "Idea Bank", description: "Capture and evaluate ideas", to: "/rnd" },
      { id: "trials", label: "Trial Batches", description: "Lab → pilot → commercial", to: "/rnd" },
      { id: "sensory", label: "Sensory Evaluation", description: "Taste, aroma, texture", to: "/rnd" },
      { id: "shelflife", label: "Shelf Life Studies", description: "Real-time and accelerated", to: "/rnd" },
    ],
  },
  {
    id: "marketing",
    name: "Marketing",
    description: "Campaigns, brand, and trade marketing",
    icon: Megaphone,
    color: "#E11D48",
    to: "/commerce",
    moduleCodes: ["marketing"],
    features: [
      { id: "campaigns", label: "Campaigns", description: "Plan and track campaigns", to: "/commerce" },
      { id: "brand", label: "Brand Assets", description: "Laija, Royal, Suya, Navara", to: "/commerce" },
      { id: "trade", label: "Trade Marketing", description: "POSM and outlet activations", to: "/commerce" },
    ],
  },
  {
    id: "governance",
    name: "Governance",
    description: "Board, DOA, and compliance",
    icon: Landmark,
    color: "#475569",
    to: "/governance",
    moduleCodes: ["governance"],
    features: [
      { id: "board", label: "Board Portal", description: "Agenda and resolutions", to: "/governance" },
      { id: "doa", label: "Delegation of Authority", description: "Approval limits matrix", to: "/governance" },
      { id: "meetings", label: "Meetings", description: "Minutes and action plans", to: "/governance" },
    ],
  },
  {
    id: "it",
    name: "IT & Digital",
    description: "Assets, access, and helpdesk",
    icon: Cpu,
    color: "#06B6D4",
    to: "/it",
    moduleCodes: ["it"],
    features: [
      { id: "assets", label: "IT Assets", description: "Devices and licenses", to: "/it" },
      { id: "access", label: "Access Requests", description: "System access workflow", to: "/it" },
      { id: "helpdesk", label: "Helpdesk", description: "Tickets and SLAs", to: "/it" },
    ],
  },
  SHARED_ADMIN,
  {
    id: "copilot",
    name: "AI Copilot",
    description: "Ask BEOS for insights and actions",
    icon: Sparkles,
    color: "#F59E0B",
    to: "/copilot",
    moduleCodes: ["copilot"],
    features: [
      { id: "ask", label: "Ask BEOS", description: "Contextual AI assistant", to: "/copilot" },
      { id: "insights", label: "AI Insights", description: "Anomaly and forecast hints", to: "/copilot" },
    ],
  },
];

const DISTRIBUTOR_MODULES: PortalModule[] = [
  SHARED_TASKS,
  {
    id: "sales",
    name: "Sales",
    description: "Orders to wholesalers, retailers, and dealers",
    icon: TrendingUp,
    color: "#EF4444",
    to: "/sales",
    moduleCodes: ["sales"],
    features: [
      { id: "so", label: "Sales Orders", description: "B2B order booking", to: "/sales" },
      { id: "quotes", label: "Quotations", description: "Customer-specific quotes", to: "/sales" },
      { id: "pricelist", label: "Customer Pricelists", description: "Volume and channel pricing", to: "/sales" },
      { id: "schemes", label: "Schemes & Rebates", description: "Trade promotions", to: "/sales" },
      { id: "returns", label: "Sales Returns", description: "Returns and credit notes", to: "/sales" },
      { id: "targets", label: "Territory Targets", description: "ASM / DSM / RSM targets", to: "/sales" },
    ],
  },
  {
    id: "purchase",
    name: "Purchase",
    description: "Buy from producers and suppliers",
    icon: ShoppingCart,
    color: "#EC4899",
    to: "/procurement",
    moduleCodes: ["procurement"],
    features: [
      { id: "suppliers", label: "Suppliers / Producers", description: "Vendor master", to: "/procurement" },
      { id: "po", label: "Purchase Orders", description: "Reorder from brand / plant", to: "/procurement" },
      { id: "grn", label: "Goods Receipt", description: "Inbound depot receiving", to: "/inventory" },
      { id: "claims", label: "Claims & Shortages", description: "Transit loss and claims", to: "/procurement" },
    ],
  },
  {
    id: "inventory",
    name: "Inventory",
    description: "Multi-depot stock and reordering",
    icon: Boxes,
    color: "#10B981",
    to: "/inventory",
    moduleCodes: ["inventory", "stores"],
    features: [
      { id: "depots", label: "Depots & Locations", description: "Regional warehouse stock", to: "/inventory" },
      { id: "stock", label: "Stock Levels", description: "On-hand and reserved", to: "/inventory" },
      { id: "reorder", label: "Reorder Rules", description: "Min/max and auto PR", to: "/inventory" },
      { id: "lot", label: "Lot / Batch Tracking", description: "Traceability and FEFO", to: "/inventory" },
      { id: "transfer", label: "Inter-Depot Transfer", description: "Move stock between depots", to: "/inventory" },
    ],
  },
  {
    id: "logistics",
    name: "Logistics & Dispatch",
    description: "Pick-pack-ship and delivery routes",
    icon: Truck,
    color: "#F97316",
    to: "/logistics",
    moduleCodes: ["logistics"],
    features: [
      { id: "pickpack", label: "Pick / Pack / Ship", description: "Warehouse outbound flow", to: "/logistics" },
      { id: "routes", label: "Delivery Routes", description: "Route optimization", to: "/logistics" },
      { id: "fleet", label: "Fleet & Vehicles", description: "Vehicle assignment", to: "/logistics" },
      { id: "pod", label: "Proof of Delivery", description: "POD and exceptions", to: "/logistics" },
    ],
  },
  {
    id: "network",
    name: "Dealer & Retail Network",
    description: "Wholesaler / retailer coverage and credit",
    icon: Building2,
    color: "#0EA5E9",
    to: "/crm",
    moduleCodes: ["crm", "sales"],
    features: [
      { id: "dealers", label: "Dealer Directory", description: "Appointed dealers and outlets", to: "/crm" },
      { id: "retailers", label: "Retailer Coverage", description: "Outlet map and visits", to: "/sales" },
      { id: "credit", label: "Credit Limits", description: "Party-wise credit control", to: "/finance" },
      { id: "cheques", label: "Issue Cheques", description: "Cheque and collection tools", to: "/finance" },
      { id: "performance", label: "Network Performance", description: "Outlet KPIs and scorecards", to: "/sales" },
    ],
  },
  {
    ...SHARED_FINANCE,
    features: [
      ...SHARED_FINANCE.features.slice(0, 4),
      { id: "collections", label: "Collections", description: "Route collection and reconciliation", to: "/finance" },
      { id: "cheques", label: "Cheques", description: "Issue, clear, and bounce tracking", to: "/finance" },
      { id: "pnl", label: "P&L / Reports", description: "Margin and depot P&L", to: "/finance" },
    ],
  },
  SHARED_CRM,
  SHARED_HR_LIGHT,
  {
    id: "marketing",
    name: "Marketing",
    description: "Trade schemes and local campaigns",
    icon: Megaphone,
    color: "#E11D48",
    to: "/commerce",
    moduleCodes: ["marketing"],
    features: [
      { id: "schemes", label: "Trade Schemes", description: "Push schemes to network", to: "/commerce" },
      { id: "posm", label: "POSM / Visibility", description: "Outlet branding kits", to: "/commerce" },
    ],
  },
  SHARED_ADMIN,
];

const WHOLESALER_MODULES: PortalModule[] = [
  SHARED_TASKS,
  {
    id: "purchase",
    name: "Purchase",
    description: "Buy from distributors and producers",
    icon: ShoppingCart,
    color: "#EC4899",
    to: "/procurement",
    moduleCodes: ["procurement"],
    features: [
      { id: "suppliers", label: "Suppliers", description: "Distributor / brand sources", to: "/procurement" },
      { id: "po", label: "Purchase Orders", description: "Bulk replenishment orders", to: "/procurement" },
      { id: "grn", label: "Goods Receipt", description: "Receive wholesale lots", to: "/inventory" },
      { id: "pricing", label: "Vendor Prices", description: "Landed cost and margins", to: "/procurement" },
    ],
  },
  {
    id: "sales",
    name: "Sales",
    description: "Wholesale orders to retailers and parties",
    icon: TrendingUp,
    color: "#EF4444",
    to: "/sales",
    moduleCodes: ["sales"],
    features: [
      { id: "so", label: "Sales Orders", description: "Party-wise order booking", to: "/sales" },
      { id: "quotes", label: "Quotations", description: "Bulk and walk-in quotes", to: "/sales" },
      { id: "parties", label: "Party Ledger", description: "Retailer and trader accounts", to: "/crm" },
      { id: "schemes", label: "Wholesale Schemes", description: "Slab discounts and bundles", to: "/sales" },
      { id: "returns", label: "Returns", description: "Damaged / unsold returns", to: "/sales" },
    ],
  },
  {
    id: "inventory",
    name: "Inventory",
    description: "Wholesale stock, lots, and godowns",
    icon: Warehouse,
    color: "#10B981",
    to: "/inventory",
    moduleCodes: ["inventory", "stores"],
    features: [
      { id: "godown", label: "Godown Stock", description: "On-hand by location", to: "/inventory" },
      { id: "lots", label: "Lot / Expiry", description: "FEFO for perishables", to: "/inventory" },
      { id: "reorder", label: "Reorder Alerts", description: "Low-stock notifications", to: "/inventory" },
      { id: "transfer", label: "Stock Transfer", description: "Between godowns", to: "/inventory" },
      { id: "damage", label: "Damage / Expire", description: "Write-offs", to: "/inventory" },
    ],
  },
  {
    id: "logistics",
    name: "Logistics",
    description: "Local delivery and dispatch",
    icon: Route,
    color: "#F97316",
    to: "/logistics",
    moduleCodes: ["logistics"],
    features: [
      { id: "dispatch", label: "Dispatch", description: "Load and send orders", to: "/logistics" },
      { id: "delivery", label: "Local Delivery", description: "Same-day / next-day runs", to: "/logistics" },
      { id: "pod", label: "Delivery Confirmation", description: "POD and disputes", to: "/logistics" },
    ],
  },
  {
    ...SHARED_FINANCE,
    description: "Party credit, cash, and collections",
    features: [
      { id: "cashbank", label: "Cash & Bank", description: "Day book and balances", to: "/finance" },
      { id: "credit", label: "Party Credit", description: "Credit limits and aging", to: "/finance" },
      { id: "cheques", label: "Cheques", description: "Issue and clear cheques", to: "/finance" },
      { id: "ar", label: "Receivables", description: "Outstanding collections", to: "/finance" },
      { id: "ap", label: "Payables", description: "Supplier dues", to: "/finance" },
      { id: "pnl", label: "P&L / Reports", description: "Wholesale margin reports", to: "/finance" },
    ],
  },
  {
    ...SHARED_CRM,
    name: "Parties & CRM",
    description: "Retailers, traders, and follow-ups",
    features: [
      { id: "parties", label: "Party Master", description: "Retailer and trader profiles", to: "/crm" },
      { id: "credit", label: "Credit Profiles", description: "Limits and risk flags", to: "/crm" },
      { id: "complaints", label: "Complaints", description: "Quality and service issues", to: "/crm" },
      { id: "followup", label: "Collections Follow-up", description: "Call lists and reminders", to: "/crm" },
    ],
  },
  SHARED_HR_LIGHT,
  SHARED_ADMIN,
];

const RETAILER_MODULES: PortalModule[] = [
  SHARED_TASKS,
  {
    id: "pos",
    name: "POS & Sales",
    description: "Counter sales, bills, and retail orders",
    icon: ScanBarcode,
    color: "#F59E0B",
    to: "/sales",
    moduleCodes: ["sales"],
    features: [
      { id: "pos", label: "Point of Sale", description: "Fast billing and receipts", to: "/sales" },
      { id: "bills", label: "Sales Bills", description: "Daily retail invoices", to: "/sales" },
      { id: "returns", label: "Returns & Exchanges", description: "Customer returns", to: "/sales" },
      { id: "shifts", label: "Cashier Shifts", description: "Open / close register", to: "/sales" },
      { id: "offers", label: "Offers at Till", description: "Apply promos at checkout", to: "/sales" },
    ],
  },
  {
    id: "purchase",
    name: "Purchase",
    description: "Replenish from wholesaler / distributor",
    icon: ShoppingCart,
    color: "#EC4899",
    to: "/procurement",
    moduleCodes: ["procurement"],
    features: [
      { id: "suppliers", label: "Suppliers", description: "Wholesaler and distributor sources", to: "/procurement" },
      { id: "po", label: "Purchase Orders", description: "Shelf replenishment orders", to: "/procurement" },
      { id: "grn", label: "Goods Receipt", description: "Receive into store stock", to: "/inventory" },
      { id: "invoices", label: "Supplier Invoices", description: "Match bill to receipt", to: "/finance" },
    ],
  },
  {
    id: "inventory",
    name: "Shelf Stock",
    description: "Store inventory, expiry, and reorder",
    icon: Package,
    color: "#10B981",
    to: "/inventory",
    moduleCodes: ["inventory", "stores"],
    features: [
      { id: "shelf", label: "Shelf Levels", description: "On-hand by SKU / shelf", to: "/inventory" },
      { id: "expiry", label: "Expiry Watch", description: "Near-expiry alerts", to: "/inventory" },
      { id: "reorder", label: "Reorder List", description: "Suggested purchases", to: "/inventory" },
      { id: "count", label: "Stock Count", description: "Cycle count and adjust", to: "/inventory" },
      { id: "damage", label: "Damage / Spoil", description: "Write-offs", to: "/inventory" },
    ],
  },
  {
    id: "commerce",
    name: "E-commerce & Consumers",
    description: "Online orders and nearby consumers",
    icon: Store,
    color: "#F25C05",
    to: "/commerce",
    moduleCodes: ["commerce", "customer"],
    features: [
      { id: "online", label: "Online Orders", description: "App / web order queue", to: "/commerce" },
      { id: "nearest", label: "Nearest Consumers", description: "Local demand and reach", to: "/customer" },
      { id: "catalog", label: "Store Catalog", description: "Products visible to shoppers", to: "/commerce" },
      { id: "fulfillment", label: "Fulfillment", description: "Pick and handoff / delivery", to: "/logistics" },
    ],
  },
  {
    id: "marketing",
    name: "Promotions",
    description: "Store offers and loyalty",
    icon: Tags,
    color: "#E11D48",
    to: "/commerce",
    moduleCodes: ["marketing"],
    features: [
      { id: "promos", label: "Store Promotions", description: "Discounts and bundles", to: "/commerce" },
      { id: "loyalty", label: "Loyalty / Points", description: "Repeat customer rewards", to: "/commerce" },
      { id: "displays", label: "Displays & POSM", description: "In-store visibility", to: "/commerce" },
    ],
  },
  {
    ...SHARED_FINANCE,
    description: "Till cash, payables, and daily close",
    features: [
      { id: "till", label: "Till / Cash", description: "Cash drawer and day close", to: "/finance" },
      { id: "ap", label: "Supplier Payables", description: "Wholesaler dues", to: "/finance" },
      { id: "ar", label: "Credit Sales", description: "Local credit accounts", to: "/finance" },
      { id: "expenses", label: "Store Expenses", description: "Rent, utilities, petty cash", to: "/finance" },
      { id: "reports", label: "Daily Sales Report", description: "Z-report and summaries", to: "/finance" },
    ],
  },
  {
    ...SHARED_CRM,
    name: "Customers",
    description: "Walk-in and regular shoppers",
    features: [
      { id: "customers", label: "Customer List", description: "Regulars and contacts", to: "/crm" },
      { id: "complaints", label: "Complaints", description: "Service and product issues", to: "/crm" },
      { id: "feedback", label: "Feedback", description: "Ratings and NPS", to: "/crm" },
    ],
  },
  {
    id: "hr",
    name: "Staff",
    description: "Cashiers and store team",
    icon: UserPlus,
    color: "#0EA5E9",
    to: "/hr",
    moduleCodes: ["hr"],
    features: [
      { id: "staff", label: "Store Staff", description: "Cashiers and helpers", to: "/hr" },
      { id: "shifts", label: "Shifts", description: "Roster and attendance", to: "/hr" },
      { id: "payroll", label: "Payroll", description: "Simple payroll run", to: "/hr" },
    ],
  },
  SHARED_ADMIN,
];

export const PORTAL_CATALOG: Record<PortalAccountType, PortalMeta> = {
  producer: {
    type: "producer",
    title: "Producer Admin",
    subtitle: "Plant operations, production, QA, and supply chain",
    icon: Factory,
    accent: "#F25C05",
    kpis: [
      { label: "Units today", key: "units_produced_today", hint: "From work orders" },
      { label: "Open orders", key: "orders_open", hint: "Sales pipeline" },
      { label: "Approvals", key: "pending_approvals", hint: "Awaiting action" },
      { label: "Attendance", key: "attendance_pct", hint: "Present today" },
    ],
    modules: PRODUCER_MODULES,
  },
  distributor: {
    type: "distributor",
    title: "Distributor Admin",
    subtitle: "Depots, dealer network, dispatch, and collections",
    icon: Truck,
    accent: "#0EA5E9",
    kpis: [
      { label: "Open orders", key: "orders_open", hint: "B2B booked" },
      { label: "Revenue today", key: "revenue_today", hint: "Collections" },
      { label: "Workflows", key: "active_workflows", hint: "In progress" },
      { label: "AP overdue", key: "ap_overdue", hint: "Payables aging" },
    ],
    modules: DISTRIBUTOR_MODULES,
  },
  wholesaler: {
    type: "wholesaler",
    title: "Wholesaler Admin",
    subtitle: "Wholesale stock, parties, and credit",
    icon: Warehouse,
    accent: "#10B981",
    kpis: [
      { label: "Open orders", key: "orders_open", hint: "Today" },
      { label: "Revenue today", key: "revenue_today", hint: "Party sales" },
      { label: "AP overdue", key: "ap_overdue", hint: "Credit aging" },
      { label: "Approvals", key: "pending_approvals", hint: "Pending" },
    ],
    modules: WHOLESALER_MODULES,
  },
  retailer: {
    type: "retailer",
    title: "Retailer Admin",
    subtitle: "POS, shelf stock, and retail sales",
    icon: Store,
    accent: "#F59E0B",
    kpis: [
      { label: "Revenue today", key: "revenue_today", hint: "Till / online" },
      { label: "Open orders", key: "orders_open", hint: "Pending fulfill" },
      { label: "Attendance", key: "attendance_pct", hint: "Staff present" },
      { label: "Approvals", key: "pending_approvals", hint: "Queue" },
    ],
    modules: RETAILER_MODULES,
  },
};

export function isPortalAccountType(value: string): value is PortalAccountType {
  return value in PORTAL_CATALOG;
}
