# Sunyazon / BEOS — Frontend Dynamization Spec

**Document purpose:** Make **every** `web/src` surface 100% dynamic — data, forms, tables, cards, KPIs, filters, actions, navigation — bound to `models.md`, `models_logic.md`, and `server/core/` (models + services + APIs). UI displays and calls APIs only; **never** owns stock, payment, approval, or QC mutations.

**Aligned to:** `models.md`, `models_logic.md`, `feature_and_module.md` §4, `design.md`, `server/core/models/`, `server/core/services/`, `server/core/urls.py`, `web/src/`

**Companion file:** [`web/src/dynamic.md`](web/src/dynamic.md) — file-by-file inventory of routes, components, hooks, and libs.

---

## Table of Contents

1. [Dynamization principles](#1-dynamization-principles)
2. [Runtime engines the UI must consume](#2-runtime-engines-the-ui-must-consume)
3. [API layers (current backend)](#3-api-layers-current-backend)
4. [Status & lifecycle vocabulary](#4-status--lifecycle-vocabulary)
5. [Frontend → Model → API → Service map](#5-frontend--model--api--service-map)
6. [Forms, tables, cards — dynamization rules](#6-forms-tables-cards--dynamization-rules)
7. [Actions that must call services](#7-actions-that-must-call-services)
8. [Navigation & permissions](#8-navigation--permissions)
9. [Gap register (display-only → full CRUD/actions)](#9-gap-register-display-only--full-crudactions)
10. [Related documents](#10-related-documents)

---

## 1. Dynamization principles

| Rule | Meaning |
|------|---------|
| **No hardcoded business data** | Lists, KPIs, options, statuses come from API / metadata — not literals in JSX |
| **Forms from `MetadataForm`** | Layout + fields + validation from `layout_json` / `fields_json` / `validation_rules` (`models.md` §3.4) |
| **Tables from Business Objects** | Columns = published field defs for `object_code`; filters = query params |
| **Cards / KPIs from analytics** | `DashboardWidget.query_config_json` + `KPISnapshot` — not client-computed policy |
| **Mutations via services** | Approve / Reject / Post / Issue / Pay → `server/core/services/*` only (`models_logic.md`) |
| **Signals stay cross-cutting** | Audit, Notification, Embedding — never recursive domain cascades in UI |
| **Capability gating** | Hide modules/menus when `Organization.enabled_capabilities` excludes them |
| **Role gating** | `RoleModulePermission` + enterprise menus; use `can(module, action)` |
| **Status display only** | `StatusBadge` maps enum strings from API; UI must not invent transitions |
| **Tenant / org scope** | Every request assumes JWT + org context; never leak cross-tenant ids |

**Generic object lifecycle (platform):** Draft → Validated → Approved → Active → Suspended → Archived → Disposed

**Generic task lifecycle:** `new` → `assigned` → `accepted` → `in_progress` → `pending_approval` → `completed` → `verified` → `closed`

---

## 2. Runtime engines the UI must consume

| Engine | Models | UI consumption |
|--------|--------|----------------|
| **Metadata** | `MetadataForm`, `BusinessObject`, `ProcessStageField` | DynamicForm renderer, Process canvas fields |
| **Workflow** | `WorkflowDefinition`, `WorkflowInstance`, `Task`, `Approval` | `/tasks`, mission inbox, approval sheets |
| **Rule / Policy** | `Rule`, `Policy` | Block buttons when API returns policy deny; show escalate |
| **Mission** | Today’s mission API + tasks | `/` My Work Center |
| **Process** | `ProcessDefinition` → stages → `WorkOrder` → `ProcessRun*` | `/process`, `/production` |
| **Notification** | `Notification` | `/notifications`, AppShell bell |
| **Analytics** | `DashboardWidget`, `KPISnapshot`, `ReportDefinition` | Dashboard KPI strips, charts |
| **Search / AI** | `EmbeddingIndex`, `SearchQueryLog` | ⌘K palette, `/copilot` |
| **RBAC / Menus** | `Module`, `MenuItem`, `Role`, `RoleModulePermission` | AppShell nav, `/admin`, `/apps` |

---

## 3. API layers (current backend)

Base: `VITE_API_URL` or `http://127.0.0.1:8000/api`

| Layer | Paths | Frontend client | Role |
|-------|-------|-----------------|------|
| **Auth / portal** | `/auth/*`, `/modules/` | `api.ts`, `auth.tsx` | Login, me, portal, module catalog |
| **Enterprise CRUD** | `/users/`, `/v2/tasks/`, `/menus/`, `/approvals/`, … | `enterprise-api.ts` | Dynamic ERP tasks, menus, settings |
| **HR CRUD** | `/hr/*` | `hr-api.ts` | Positions → payroll mutations |
| **Company / gov** | `/company/*`, `/governance/documents/` | `company-api.ts` | Registration, vacancies, docs |
| **Domain dashboards** | `/dashboard/`, `/stock/`, `/finance/`, … | `domain-api.ts` | Mostly GET aggregates (compat) |

**Target:** Domain pages move from read-only aggregates to service-backed action endpoints (same pattern as HR + Tasks), while MetadataForm drives create/edit UIs.

---

## 4. Status & lifecycle vocabulary

Must match `models.md` / `models_logic.md` (UI badges + filters only):

| Domain | Field | Allowed values |
|--------|-------|----------------|
| Task | `status` | new, assigned, accepted, in_progress, pending_approval, completed, verified, closed |
| Task | `priority` | low, medium, high, critical |
| KYC | `verification_status` | pending_approval, verified, rejected |
| Order (commerce) | `payment_status` | pending, paid, failed, refunded |
| Order | `order_status` | placed, confirmed, packed, shipped, delivered, cancelled, returned |
| Product | `status` | draft, published, archived |
| PR | `status` | draft, submitted, approved, rejected, closed |
| PO | `status` | draft, approved, sent, closed, cancelled |
| GRN | `status` | draft, received, posted, cancelled |
| GRN | `qc_status` | pending, pass, fail, partial |
| Stock ledger | `transaction_type` | in, out, adjust |
| Work order | `status` | draft, released, in_progress, on_hold, completed, cancelled |
| Process run | `status` | pending, in_progress, completed, aborted |
| Stage | `status` | pending, in_progress, completed, skipped, failed |
| BOM | `status` | draft, approved, obsolete |
| QC | result / status | pass, fail, hold |
| Final QA | `release_status` | held, released, rejected |
| NCR | `status` | open, investigating, corrected, closed |
| CAPA | `status` | open, closed |
| Dispatch | `status` | planned, loaded, dispatched, delivered, cancelled |
| Voucher | `status` | draft, verified, posted (+ cancelled reverse) |
| Purchase payment | `payment_status` | unpaid, partial, paid |
| Leave | `approval_status` | pending, approved, rejected |
| Employee | `status` | active, on_leave, suspended, exited |
| Payroll | `status` | draft, processed, approved, paid |
| Attendance | `status` | present, absent, half_day, leave |
| Complaint | `status` | registered, investigating, capa, closed |
| Pipeline | `stage` | lead → … → won / lost |
| Maint WO | `status` | requested, approved, in_progress, closed |
| Equipment | `health_index` | green, yellow, red |
| DocStatus | shared | draft, approved, posted, cancelled |

---

## 5. Frontend → Model → API → Service map

### 5.1 Workspace / ERP routes

| Route file | Primary models (`models.md`) | Read API | Mutation service(s) | UI surfaces |
|------------|------------------------------|----------|---------------------|-------------|
| `routes/index.tsx` | `KPISnapshot`, `Task`, `Notification`, mission | `GET /dashboard/`, `/today-mission/`, `/v2/dashboard/`, `/tasks/` | — (links to tasks) | Mission card, KPI cards, charts, alerts, task list |
| `routes/tasks.tsx` | `Task`, `TaskStatus`, `Approval`, `TaskComment`, `TaskHistory`, `TaskAttachment` | `/v2/tasks/`, `/task-statuses/` | `workflow_service` + enterprise TaskViewSet | Filters, list, detail, create form, approve/return/reject, comments |
| `routes/hr.tsx` | `PositionMaster`, `Employee`, `JobVacancy`, `JobApplicant`, `OnboardingProcess`, `TrainingLog`, `Attendance`, `LeaveRequest`, `PayrollRun` | `/hr/*` | `leave_service`, `payroll_service`, `hr_recruitment_service` | Section tabs (#hash), KPI pie, tables, create/edit modals, approve leave, payroll actions |
| `routes/production.tsx` | `WorkOrder`, `Batch`, `ProcessRun` | `GET /work-orders/` | `work_order_service`, `process_service` | KPI cards, WO table |
| `routes/process.tsx` | `IndustryTemplate`, `ProcessDefinition`, `ProcessStage`, `ProcessStageField`, `WorkOrder`, `ProcessRun*` | `GET /process/` (+ dashboard service) | `process_service`, `org_setup_service`, `process_dashboard_service` | Canvas, templates, stages, WO/runs sections, create/instantiate |
| `routes/inventory.tsx` | `ItemMaster`, `Warehouse`, `StockLedger`, `Batch` | `GET /stock/` | `stock_service` (reorder → Policy/PR) | KPI, low-stock cards, stock table |
| `routes/stores.tsx` | `StockLedger`, `MaterialIssue`, `GRN` | `GET /stock-movements/` | `grn_service`, `stock_service` | Movement table (+/−) |
| `routes/procurement.tsx` | `PurchaseRequisition`, `PurchaseOrder`, `GRN`, `Vendor`, `RFQ` | `GET /procurement/` | `procurement_service`, `grn_service` | PR cards, PO cards, GRN table |
| `routes/quality.tsx` | `IncomingInspection`, `InProcessQC`, `FinalQARelease`, `LabReport`, `NCR`, `CAPA` | `GET /quality/` | `qa_service` | QC cards, batch release progress |
| `routes/sales.tsx` | `SalesOrder`, `Party`, `ASMOrder`, `DealerSalesOrder`, `RetailSalesOrder` | `GET /sales-orders/`, `/sales-by-region/` | `dispatch_service` | KPI, region chart, SO table |
| `routes/logistics.tsx` | `Dispatch`, `POD`, `Vehicle`, `Route` | `GET /logistics/` | `dispatch_service` | Trip cards |
| `routes/finance.tsx` | `JournalVoucher`, `JournalLine`, `Ledger`, `DayBook`, `Purchase`, `SalesReceived`, `TaxAuditRecord` | `GET /finance/` | `finance_service` | KPI, GL table, VAT card, AP table/pie |
| `routes/crm.tsx` | `Complaint`, `PipelineDeal`, `CustomerActivity` | `GET /crm/` | `crm_service` | Leads table, pipeline stages |
| `routes/maintenance.tsx` | `Equipment`, `MaintenanceWorkOrder`, `PMSchedule`, `Calibration` | `GET /maintenance/` | `maintenance_service` | Assets table, work requests |
| `routes/rnd.tsx` | `WorkOrder` / process stages (R&D template) | `GET /rnd/` | `process_service` | Project table |
| `routes/it.tsx` | `HelpTicket` (+ initiatives as metadata) | `GET /it/` | (ticket service / communication) | Ticket cards |

### 5.2 Consumer / public layer

| Route file | Primary models | Read API | Mutation service(s) | UI surfaces |
|------------|----------------|----------|---------------------|-------------|
| `routes/feed.tsx` | `FeedPost`, `FeedEngagement`, `FeedMedia` | `GET /feed/` | `social_service` | Post cards |
| `routes/commerce.tsx` | `Product`, `Order`, `OrderItem`, `Cart` | `GET /commerce/` | `checkout_service`, `payment_service` | Product cards, order list, KPI |
| `routes/customer.tsx` | `Order`, `Address`, profile/loyalty | `GET /customer/` | `checkout_service`, `kyc_service` | Orders, addresses, loyalty card |
| `routes/payments.tsx` | `PaymentTransaction`, `AdCampaign`, `PaymentGateway` | `GET /payments/` | `payment_service`, `checkout_service` | Txn cards, campaigns, KPI |
| `routes/media.tsx` | `LiveStream`, `MediaAsset`, `MediaPlaylist` | `GET /media/` | media/social services | Live + video cards |
| `routes/chat.tsx` | `ChatThread`, `ChatMessage`, `CallSession` | `GET /chat/`, `/chat/:id/messages/` | `social_service` | Thread list, message pane, composer |
| `routes/docs.tsx` | `Document`, `DocumentTemplate`, `BlogPost` | `GET /docs/` | document publish + embedding | Doc cards, templates |
| `routes/auth-kyc.tsx` | `KYCDocument`, `Session`, `User` | `GET /auth-kyc/` | `kyc_service` | KYC cards, sessions |
| `routes/jobs.tsx` | `JobVacancy`, `JobApplicant` | `/hr/vacancies/`, applications | `hr_recruitment_service` | Vacancy cards, apply form |

### 5.3 Auth, admin, governance, system

| Route file | Primary models | Read API | Mutation service(s) | UI surfaces |
|------------|----------------|----------|---------------------|-------------|
| `routes/login.tsx` | `User`, `Session`, portal | `POST /auth/login/` | `auth_service` | Login form, portal picker |
| `routes/register.company.tsx` | `Organization`, shareholders, leadership | `/company/registration*` | `company_registration_service`, `org_setup_service` | Multi-step registration form |
| `routes/governance.tsx` | `BoardDeclaration`, `Meeting`, `CompanyDocument`, `Shareholder`, `CompanyLeadershipSeat` | `GET /governance/`, `/governance/documents/` | `org_setup_service` + company APIs | Board/meeting/docs cards, create/edit |
| `routes/admin.tsx` | `Role`, `Module`, `RoleModulePermission`, `MetadataForm`, `WorkflowDefinition` | `GET /admin-console/` | admin ViewSets | Roles, modules, permission matrix, forms, workflows |
| `routes/audit.tsx` | `AuditLog`, `ActivityLog` | `GET /audit/` | signals only (immutable) | Audit table |
| `routes/notifications.tsx` | `Notification` | `GET /notifications/`, `/v2/notifications/` | mark-read (enterprise) | Alert cards |
| `routes/settings.tsx` | `AppSetting`, `UserProfile`, theme | profile / settings APIs | `SettingViewSet` | Preference cards (theme local OK) |
| `routes/apps.tsx` | `Module` catalog | `/auth/modules/`, `/modules/` | — | App launcher grid |
| `routes/portal.$portalType.tsx` | portal + `enabled_capabilities` | `/auth/portal/` | — | Portal dashboard via `PortalDashboard` |
| `routes/copilot.tsx` | `SearchQueryLog`, embeddings, KPIs | search / AI endpoints | AI services | Chat stub → live RAG |
| `routes/__root.tsx` | — | providers | — | Theme, auth, query, outlet |

### 5.4 Layout / shared / libs (must stay dynamic)

| File | Dynamization |
|------|--------------|
| `components/layout/AppShell.tsx` | Menus from `/menus/` then modules; dept menus from `department-menus` until MenuItem fully seeded |
| `components/layout/nav-items.ts` | Fallback only; prefer DB menus + `modulesToNav` |
| `lib/department-menus.ts` | Mirror `models.md` §15–22; migrate to `MenuItem` tree |
| `lib/portal-catalog.ts` | Labels static OK; KPI **values** from `/dashboard/` |
| `lib/modules.ts` | Icon map static; routes/labels from Module API |
| `components/portals/PortalDashboard.tsx` | Modules filtered by auth + capabilities |
| `components/ui-bits/QueryState.tsx` | Loading/error/empty for all API pages |
| `components/ui-bits/Badge.tsx` | Status/priority colors from enum maps |
| `components/ui/*` | Primitives — no domain data; used by DynamicForm/Table |
| `hooks/use-domain.ts` | All domain GET hooks |
| `hooks/use-enterprise.ts` | Tasks, menus, mission, search |
| `lib/domain-api.ts` / `enterprise-api.ts` / `hr-api.ts` / `company-api.ts` | Sole HTTP surface for pages |
| `lib/domain-types.ts` / `process-types.ts` | Mirror API/DTO shapes to models |
| `lib/auth.tsx` | `me` + permissions + modules |

---

## 6. Forms, tables, cards — dynamization rules

### 6.1 Forms (never hardcode field lists long-term)

| Pattern | Source | Example |
|---------|--------|---------|
| **MetadataForm** | `object_code` + `fields_json` + `layout_json` | PO, PR, Leave, Employee, Complaint |
| **ProcessStageField** | Stage definition | Process canvas stage forms |
| **Enterprise Task** | Task create schema + checklist_json | `/tasks` New Task |
| **HR modals** | Field set from `hr.*` models (already API-backed) | Employee / Leave / Payroll |
| **Company registration** | Options from `/company/registration/options/` | Geo, account types |

**Field types (platform-wide):** Text, Number, Date/DateTime, Currency, Dropdown, Multi-select, Boolean, File, Image, Video, Barcode, QR, RFID, GPS, Signature, Rich text (`feature_and_module.md` §4.2).

**Smart context (API side, UI display):** Supplier → price/balance/QC; Customer → credit/AR; Product → stock/batch/expiry.

### 6.2 Tables

| Pattern | Source |
|---------|--------|
| Column set | BusinessObject / MetadataForm field defs or documented model fields |
| Row data | Paginated API `results` |
| Status column | `StatusBadge` + model enum |
| Row actions | Permission-gated; call service endpoints |
| Empty / error | `QueryState` |

### 6.3 Cards & KPIs

| Pattern | Source |
|---------|--------|
| KPI value | `KPISnapshot` or dashboard aggregate endpoint |
| Widget layout | `DashboardWidget` for role/workspace |
| List cards | Same DTO as table rows (mobile card / desktop table) |
| Progress bars | Server fields (e.g. FinalQARelease) — **not** fake % in UI |

### 6.4 Charts

| Chart | Data API | Note |
|-------|----------|------|
| Revenue trend / brand mix / production by line | `/dashboard/` | Server aggregates |
| Sales by region | `/sales-by-region/` | |
| AP pie / HR attendance pie | Client may count status **buckets from API rows**; policy thresholds stay server-side |

---

## 7. Actions that must call services

From `models_logic.md` — UI buttons map 1:1 to services (never local state as source of truth):

| UI action | Service method (target) | Cascade summary |
|-----------|-------------------------|-----------------|
| Task Approve / Reject / Return | `workflow_service.decide_approval` | Advance/rewind workflow + entity |
| KYC verify | `kyc_service.verify_kyc` | `User.is_kyc_verified` |
| Checkout / pay | `checkout_service` / `payment_service` | Order + stock |
| Submit / approve PR | `procurement_service` | RFQ / draft PO |
| Approve / send / cancel PO | `procurement_service` | Allow GRN |
| Receive / post GRN | `grn_service` | QC hold → StockLedger IN |
| Issue material | `grn_service.issue_material` | StockLedger OUT |
| Approve stock adjust | `stock_service` | Ledger adjust + reorder rules |
| Release WO / complete stage / commit line | `process_service` / `work_order_service` | Runs, stock, costing |
| QC pass/fail / Final release / NCR / CAPA | `qa_service` | Gates FG / dispatch |
| Approve SO / dispatch / POD | `dispatch_service` | Credit check, stock OUT, AR |
| Post voucher / pay AP / clear cheque | `finance_service` | DayBook / Ledger / CashBank |
| Approve/reject leave | `leave_service` | Attendance + employee status |
| Process / approve / pay payroll | `payroll_service` | JV + CashBank |
| Publish vacancy / hire | `hr_recruitment_service` | Employee + onboarding |
| Complaint advance / deal won | `crm_service` | NCR/CAPA / SO/WO |
| PM due / close maint / calibration | `maintenance_service` | WO + health_index |
| Feed publish / chat send | `social_service` | notifications / thread stamp |

---

## 8. Navigation & permissions

| Source | Used by |
|--------|---------|
| `GET /menus/` (`MenuItem`) | AppShell preferred nav |
| `GET /auth/modules/` / `user.modules` | `modulesToNav`, `/apps` |
| `RoleModulePermission` | `can(code, action)` — view/create/edit/delete |
| `Organization.enabled_capabilities` | Hide production/QC/etc. |
| `department-menus.ts` | In-department hash sections (HR `#leave`, Process `#runs`, …) until menus fully DB-driven |
| `portal-catalog.ts` | Account-type portal modules (producer/distributor/…) |

**Login UX rule:** Open **My Work Center** (`/`) with mission + tasks — never an empty shell.

---

## 9. Gap register (display-only → full CRUD/actions)

Current reality (post-audit of `web/src`): most pages already **GET** live data. Gaps to reach **100% dynamic** (mutations + metadata forms):

| Area | Today | Required for 100% |
|------|-------|-------------------|
| Procurement / Inventory / Stores / Quality / Sales / Logistics / Finance / CRM / Maintenance | Read dashboards (`views_domain` GET-only) | HTTP POST/PATCH that call matching services; MetadataForm create/edit |
| Commerce / Payments / Customer / Feed / Media | Read | Checkout, pay, refund, publish, cart mutations |
| Feed engage / Notifications dismiss / Auth-KYC Review / Admin “Open designer” | UI stubs only | Wire to `social_service`, notification mark-read, `kyc_service`, Form/Workflow builders |
| Chat | Read + **local-only** composer (not posted) | Persist via `social_service.post_chat_message` |
| Copilot | Hardcoded local echo | `/search/` + embedding / AI APIs |
| Process | Rich UI calls `domainApi.processAction`, but **`domain-api.ts` only exports GET `/process/`** | Expose `process_dashboard_service` + `process_service` mutation HTTP; align client DTOs |
| Low-stock badge | Client `on_hand < reorder_level` display OK | Reorder **action** must be Policy → `stock_service` / PR create |
| Batch release progress bar | Approximate % in UI | Drive from `FinalQARelease.release_status` only |
| Settings prefs (language, MFA toggles) | Hardcoded local | Persist via `AppSetting` / profile (`/settings/bulk/`) |
| `nav-items.ts` / `department-menus.ts` / `portal-catalog` labels | Static fallbacks | Prefer `/menus/` + modules + capabilities |
| Legacy vs v2 | Some pages could still hit `/tasks/`, `/notifications/`, `/employees/` | Prefer `/v2/tasks/`, `/v2/notifications/`, `/hr/*` for writes |

**Already strong (CRUD/actions):** `hr.tsx` (`/hr/*`), `tasks.tsx` (`/v2/tasks/` + `/approvals/`), `governance.tsx` (docs), `jobs.tsx`, `register.company.tsx`, enterprise settings/menus.

---

## 10. Related documents

| File | Role |
|------|------|
| `models.md` | Full model catalog + ER |
| `models_logic.md` | Cascades + service ownership |
| `feature_and_module.md` | Dynamic forms, workflows, ERP field specs |
| `design.md` | Visual system for forms/tables/cards |
| `web/src/dynamic.md` | **File-by-file** frontend dynamization inventory |
| `server/core/models/` | Implemented Django models |
| `server/core/services/` | Domain cascades |
| `server/core/urls.py` | HTTP surface |

---

*Principle: business logic in backend services only — frontend is a dynamic projection of models, metadata, and APIs.*
