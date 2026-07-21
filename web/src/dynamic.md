# Sunyazon / BEOS — `web/src` File-by-File Dynamization Inventory

**Document purpose:** 100% coverage of frontend files — every page, component, form, table, card, hook, and lib — mapped to models (`models.md`), cascades (`models_logic.md`), and backend APIs/services.  
**Master spec:** [`../../dynamic.md`](../../dynamic.md)  
**Rule:** Only documentation in this file; implement dynamization in code later per this register.

---

## How to read each entry

| Column | Meaning |
|--------|---------|
| **Dynamic?** | `live` = already API-backed GET/CRUD; `partial` = GET only or mixed; `static` = local/hardcoded OK or needs wiring |
| **Models** | Canonical Django / `models.md` entities |
| **API** | Current `web` client → path |
| **Service** | Target mutation owner in `server/core/services/` |
| **UI** | Forms / tables / cards / KPIs / actions present |

---

## 1. Routes (`web/src/routes/`)

### 1.1 `__root.tsx`
| | |
|--|--|
| **Dynamic?** | live (shell) |
| **Models** | — |
| **API** | Auth provider, QueryClient, theme |
| **UI** | Root layout, `<Outlet />`, error boundary hooks |
| **Dynamize** | Keep providers only; no domain literals |

### 1.2 `index.tsx` — `/` My Work Center
| | |
|--|--|
| **Dynamic?** | live |
| **Models** | `KPISnapshot`, `Task`, `Notification`, mission aggregates, production/sales summaries |
| **API** | `domainApi.dashboard` → `GET /dashboard/`; `useEnterpriseDashboard` → `/v2/dashboard/`; `useTodayMission` → `/today-mission/`; `useTasks` |
| **Service** | Display only; deep-link actions to `workflow_service` |
| **UI** | Mission hero card; KPI cards (revenue, tasks, employees, alerts); area/bar/pie charts; alert list; critical tasks |
| **Dynamize** | Prefer `DashboardWidget` configs per role; mission title from API only |

### 1.3 `tasks.tsx` — `/tasks`
| | |
|--|--|
| **Dynamic?** | live (CRUD + comments) |
| **Models** | `Task`, `TaskStatus`, `Approval`, `TaskComment`, `TaskHistory`, `TaskAttachment`, `TaskLabel`, `TaskCategory`, `Project` |
| **API** | `enterpriseApi` `/v2/tasks/`, `/task-statuses/`, comments/history/attachments |
| **Service** | `workflow_service` for approve/reject/return; TaskViewSet for CRUD |
| **UI** | Status filter pills; search; priority select; task list; detail pane; checklist; **New Task** form; Approve/Reject/Return; comments; attachments |
| **Statuses** | new → … → closed (`models_logic.md` §1) |

### 1.4 `hr.tsx` — `/hr` (+ `#` sections)
| | |
|--|--|
| **Dynamic?** | live (full CRUD) |
| **Models** | `PositionMaster`, `Employee`, `Department`, `JobVacancy`, `JobApplicant`, `OnboardingProcess`, `EmployeeOnboardingTask`, `TrainingLog`, `Attendance`, `LeaveRequest`, `PayrollRun`, `PayrollLine` |
| **API** | `hrApi.*` → `/hr/overview|positions|employees|…|payroll/`; vacancies/applications |
| **Service** | `leave_service`, `payroll_service`, `hr_recruitment_service` |
| **UI** | Section nav (overview, positions, employees, vacancies, applicants, onboarding, training, attendance, leave, payroll); KPI cards + attendance pie; **tables** per section; **forms/modals** (employee, position, vacancy, leave, training, payroll); actions Approve/Reject leave, payroll process/approve/pay, hire/review applicant, exit employee |
| **Statuses** | Leave pending/approved/rejected; Employee active/on_leave/…; Payroll draft→paid |

### 1.5 `production.tsx` — `/production`
| | |
|--|--|
| **Dynamic?** | partial (GET) |
| **Models** | `WorkOrder`, `Batch`, `ProcessRun` |
| **API** | `useWorkOrders` → `GET /work-orders/` |
| **Service** | `work_order_service`, `process_service` |
| **UI** | KPI cards; work-order **table** (code, product, batch, qty, status, QA) |
| **Dynamize** | Release / hold / complete buttons → services; link to `/process#workorders` |

### 1.6 `process.tsx` — `/process`
| | |
|--|--|
| **Dynamic?** | partial → target live |
| **Models** | `IndustryTemplate`, `ProcessDefinition`, `ProcessStage`, `ProcessStageField`, `WorkOrder`, `ProcessRun`, `ProcessRunStage`, `ProcessRunLine`, `ProcessFieldValue` |
| **API** | `useProcess` / `domainApi.process` → `GET /process/` only today; UI also references `domainApi.processAction` (**not defined** in `domain-api.ts`) |
| **Service** | `process_service`, `org_setup_service`, `process_dashboard_service` (builders exist; mutation HTTP largely unwired) |
| **UI** | Sections overview/templates/definitions/stages/workorders/runs; stage **canvas**; create/instantiate **modals**; zoom toolbar; definition list **cards/table** |
| **Dynamize** | Expose dashboard + actions over HTTP; stage labels from metadata; fields from `ProcessStageField`; stock lines via `commit_run_line` |

### 1.7 `inventory.tsx` — `/inventory`
| | |
|--|--|
| **Dynamic?** | partial (GET) |
| **Models** | `ItemMaster`, `Warehouse`, `StockLedger`, `Batch` |
| **API** | `useStock` → `GET /stock/` |
| **Service** | `stock_service` (+ Policy → PR) |
| **UI** | KPI cards (SKUs, below reorder, warehouses, categories); mobile **cards**; desktop **table** (SKU, name, category, warehouse, batch, on hand, reserved, reorder, expiry); low-stock warning |
| **Dynamize** | “Create PR” action for low stock → backend Policy; FEFO note display from batch expiry |

### 1.8 `stores.tsx` — `/stores`
| | |
|--|--|
| **Dynamic?** | partial (GET) |
| **Models** | `StockLedger`, `MaterialIssue`, `GRN` |
| **API** | `useStockMovements` → `GET /stock-movements/` |
| **Service** | `grn_service`, `stock_service` |
| **UI** | KPI; movement **table** with +/− signs |
| **Dynamize** | Issue / adjust / post actions; sign from `transaction_type` only |

### 1.9 `procurement.tsx` — `/procurement`
| | |
|--|--|
| **Dynamic?** | partial (GET) |
| **Models** | `PurchaseRequisition`, `PurchaseRequisitionLine`, `PurchaseOrder`, `PurchaseOrderLine`, `GRN`, `GRNLine`, `Vendor`, `RFQ` |
| **API** | `useProcurement` → `GET /procurement/` |
| **Service** | `procurement_service`, `grn_service` |
| **UI** | KPI; PR **cards**; PO **cards**; GRN **table** (mobile cards) |
| **Dynamize** | Submit/approve PR, approve/send PO, receive/post GRN forms + actions |

### 1.10 `quality.tsx` — `/quality`
| | |
|--|--|
| **Dynamic?** | partial (GET) |
| **Models** | `IncomingInspection`, `InProcessQC`, `FinalQARelease`, `LabReport`, `NCR`, `CAPA`, `QualityMaster` |
| **API** | `useQuality` → `GET /quality/` |
| **Service** | `qa_service` |
| **UI** | Pass/fail/pending KPI; QC test **cards**; batch release **cards** + progress bar |
| **Dynamize** | Pass/fail/release actions; progress from `release_status` only (held/released/rejected) |

### 1.11 `sales.tsx` — `/sales`
| | |
|--|--|
| **Dynamic?** | partial (GET) |
| **Models** | `SalesOrder`, `SalesOrderLine`, `Party`, `ASMOrder`, `DealerSalesOrder`, `RetailSalesOrder`, `PromotionScheme` |
| **API** | `useSalesOrders`, `useSalesByRegion` |
| **Service** | `dispatch_service` (approve + credit check) |
| **UI** | KPI; regional **bar chart**; status summary **card**; SO **table**/cards |
| **Dynamize** | Approve SO / create dispatch; credit-limit block from API error |

### 1.12 `logistics.tsx` — `/logistics`
| | |
|--|--|
| **Dynamic?** | partial (GET) |
| **Models** | `Dispatch`, `POD`, `Vehicle`, `Route`, `Territory` |
| **API** | `useLogistics` → `GET /logistics/` |
| **Service** | `dispatch_service` |
| **UI** | Trip **cards** (status, vehicle, route) |
| **Dynamize** | Load / dispatch / POD (signature) actions |

### 1.13 `finance.tsx` — `/finance`
| | |
|--|--|
| **Dynamic?** | partial (GET) |
| **Models** | `JournalVoucher`, `JournalLine`, `Ledger`, `DayBook`, `Purchase`, `PurchasePayment`, `SalesReceived`, `CashBankAccount`, `TaxAuditRecord`, `ProfitLossSnapshot` |
| **API** | `useFinance` → `GET /finance/` |
| **Service** | `finance_service` |
| **UI** | KPI (AP, overdue, debit/credit); GL **table**; VAT summary **card**; AP status **pie**; AP **table**/cards |
| **Dynamize** | Post voucher, record payment/receipt; never edit posted books in UI |

### 1.14 `crm.tsx` — `/crm`
| | |
|--|--|
| **Dynamic?** | partial (GET) |
| **Models** | `Complaint`, `PipelineDeal`, `CustomerActivity` |
| **API** | `useCrm` → `GET /crm/` |
| **Service** | `crm_service` |
| **UI** | Leads **table**; pipeline stage chips |
| **Dynamize** | Register complaint, advance SLA, mark deal won → SO/WO |

### 1.15 `maintenance.tsx` — `/maintenance`
| | |
|--|--|
| **Dynamic?** | partial (GET) |
| **Models** | `Equipment`, `MaintenanceWorkOrder`, `PMSchedule`, `Calibration` |
| **API** | `useMaintenance` → `GET /maintenance/` |
| **Service** | `maintenance_service` |
| **UI** | Assets **table**; work-request **cards** |
| **Dynamize** | Close WO, record calibration fail → health_index |

### 1.16 `rnd.tsx` — `/rnd`
| | |
|--|--|
| **Dynamic?** | partial (GET) |
| **Models** | Process Engine (`WorkOrder` / stages under R&D template) |
| **API** | `useRnd` → `GET /rnd/` |
| **Service** | `process_service` |
| **UI** | Project **table** (name, status, stage) |
| **Dynamize** | Same as process runs; stage names from template metadata |

### 1.17 `it.tsx` — `/it`
| | |
|--|--|
| **Dynamic?** | partial (GET) |
| **Models** | `HelpTicket` (+ DT initiatives as documents/metadata) |
| **API** | `useIt` → `GET /it/` |
| **Service** | communication / ticket handlers |
| **UI** | Ticket **cards** (subject, status, priority) |
| **Dynamize** | Create/update ticket forms |

### 1.18 `feed.tsx` — `/feed`
| | |
|--|--|
| **Dynamic?** | partial (GET) |
| **Models** | `FeedPost`, `FeedEngagement`, `FeedMedia`, `FeedProductLink` |
| **API** | `useFeed` → `GET /feed/` |
| **Service** | `social_service` |
| **UI** | Post **cards** (author, body, likes, comments) |
| **Dynamize** | Publish/engage mutations; job vacancy posts via `feed_post_id` |

### 1.19 `commerce.tsx` — `/commerce`
| | |
|--|--|
| **Dynamic?** | partial (GET) |
| **Models** | `Product`, `ProductImage`, `Order`, `OrderItem`, `Cart`, `Category`, `Review` |
| **API** | `useCommerce` → `GET /commerce/` |
| **Service** | `checkout_service`, `payment_service` |
| **UI** | KPI (GMV, orders, AOV, rating); product **cards**; order list |
| **Dynamize** | Publish product, checkout, cancel/refund |

### 1.20 `customer.tsx` — `/customer`
| | |
|--|--|
| **Dynamic?** | partial (GET) |
| **Models** | `Order`, `Address`, `UserProfile`, loyalty aggregates |
| **API** | `useCustomer` → `GET /customer/` |
| **Service** | `checkout_service`, `kyc_service.set_default_address` |
| **UI** | Order **cards**; address **cards**; loyalty **card** |
| **Dynamize** | Set default address; reorder |

### 1.21 `payments.tsx` — `/payments`
| | |
|--|--|
| **Dynamic?** | partial (GET) |
| **Models** | `PaymentTransaction`, `PaymentGateway`, `AdCampaign`, `AdImpression`, `AdPlan` |
| **API** | `usePayments` → `GET /payments/` |
| **Service** | `payment_service`, `checkout_service` |
| **UI** | KPI; transaction **cards**; campaign **cards** |
| **Dynamize** | Gateway webhook display only; activate campaign after pay |

### 1.22 `media.tsx` — `/media`
| | |
|--|--|
| **Dynamic?** | partial (GET) |
| **Models** | `LiveStream`, `LiveViewer`, `MediaAsset`, `MediaPlaylist` |
| **API** | `useMedia` → `GET /media/` |
| **Service** | media / social |
| **UI** | Live **cards**; video **cards** |
| **Dynamize** | Start/end stream; playlist CRUD |

### 1.23 `chat.tsx` — `/chat`
| | |
|--|--|
| **Dynamic?** | partial |
| **Models** | `ChatThread`, `ChatMessage`, `ChatParticipant`, `CallSession` |
| **API** | `useChatThreads`, `useChatMessages` |
| **Service** | `social_service.post_chat_message` |
| **UI** | Thread list **cards**; message pane; composer **form** (send is **local-only** today) |
| **Dynamize** | POST messages via `social_service`; update `last_message_at` |

### 1.24 `docs.tsx` — `/docs`
| | |
|--|--|
| **Dynamic?** | partial (GET) |
| **Models** | `Document`, `DocumentTemplate`, `BlogPost` |
| **API** | `useDocs` → `GET /docs/` |
| **Service** | publish + `embedding_signal` |
| **UI** | Document **cards**; template list |
| **Dynamize** | Upload/publish forms |

### 1.25 `auth-kyc.tsx` — `/auth-kyc`
| | |
|--|--|
| **Dynamic?** | partial (GET) |
| **Models** | `KYCDocument`, `Session`, `User` |
| **API** | `useAuthKyc` → `GET /auth-kyc/` |
| **Service** | `kyc_service` |
| **UI** | KYC **cards**; session **cards** |
| **Dynamize** | Upload/resubmit KYC; verify/reject (admin) |

### 1.26 `jobs.tsx` — `/jobs`
| | |
|--|--|
| **Dynamic?** | live |
| **Models** | `JobVacancy`, `JobApplicant`, `SelectionScoring` |
| **API** | `companyApi.vacancies|applications|apply` |
| **Service** | `hr_recruitment_service` |
| **UI** | Vacancy **cards**; apply **form** |
| **Dynamize** | Keep API-driven; hire flow lives in HR |

### 1.27 `login.tsx` — `/login`
| | |
|--|--|
| **Dynamic?** | live |
| **Models** | `User`, `Session`, portal / org membership |
| **API** | `auth` login/register/me |
| **Service** | `auth_service`, `enterprise_auth` |
| **UI** | Login **form**; remember me; portal/account-type UI |
| **Dynamize** | Options from API where possible; redirect to `/` mission |

### 1.28 `register.company.tsx` — `/register/company`
| | |
|--|--|
| **Dynamic?** | live |
| **Models** | `Organization`, `Shareholder`, `CompanyLeadershipSeat`, `IndustryTemplate`, geo masters |
| **API** | `companyApi.register|lookup`, registration options |
| **Service** | `company_registration_service`, `org_setup_service` |
| **UI** | Multi-step **form** (company, shareholders, leadership); lookup |
| **Dynamize** | Template install → process definitions on create |

### 1.29 `governance.tsx` — `/governance`
| | |
|--|--|
| **Dynamic?** | live (docs CRUD) |
| **Models** | `BoardDeclaration`, `Meeting`, `CompanyDocument`, `Shareholder`, `CompanyLeadershipSeat` |
| **API** | `useGovernance`; `companyApi` governance docs |
| **Service** | `org_setup_service` (sign board, complete meeting) |
| **UI** | Board/meeting/resolution **cards**; leadership/shareholder lists; document create/edit **forms** |
| **Dynamize** | Sign declaration → `signed_at`; meeting minutes `Document` |

### 1.30 `admin.tsx` — `/admin`
| | |
|--|--|
| **Dynamic?** | partial (GET matrix) |
| **Models** | `Role`, `Module`, `RoleModulePermission`, `MetadataForm`, `WorkflowDefinition` |
| **API** | `useAdminConsole` → `GET /admin-console/` |
| **Service** | enterprise Role/Module/Menu ViewSets |
| **UI** | Roles list; modules; permission **matrix table**; forms list; workflows list; + New / Open designer buttons (**stubs**) |
| **Dynamize** | Full RBAC CRUD via enterprise ViewSets; wire Form/Workflow builders to `MetadataForm` / `WorkflowDefinition` |

### 1.31 `audit.tsx` — `/audit`
| | |
|--|--|
| **Dynamic?** | live (immutable read) |
| **Models** | `AuditLog`, `ActivityLog` |
| **API** | `useAudit` → `GET /audit/` |
| **Service** | `audit_signal` only |
| **UI** | Audit **table** (action, actor, object, time) |
| **Dynamize** | Filters only; never delete |

### 1.32 `notifications.tsx` — `/notifications`
| | |
|--|--|
| **Dynamic?** | partial |
| **Models** | `Notification` |
| **API** | `useNotifications`; enterprise `/v2/notifications/` |
| **Service** | `notification_signal` |
| **UI** | Alert **cards** |
| **Dynamize** | Mark read / dismiss via API |

### 1.33 `settings.tsx` — `/settings`
| | |
|--|--|
| **Dynamic?** | partial |
| **Models** | `AppSetting`, `UserProfile` |
| **API** | profile / settings (enterprise) |
| **Service** | `SettingViewSet` |
| **UI** | Theme toggle **cards**; account info |
| **Dynamize** | Persist settings JSON; theme may stay client |

### 1.34 `apps.tsx` — `/apps`
| | |
|--|--|
| **Dynamic?** | live |
| **Models** | `Module` |
| **API** | `useAuth` modules |
| **UI** | App launcher **grid** cards |
| **Dynamize** | Filter by capability + permission |

### 1.35 `portal.$portalType.tsx` — `/portal/:portalType`
| | |
|--|--|
| **Dynamic?** | live |
| **Models** | portal account type + enabled modules |
| **API** | auth portal + dashboard KPIs |
| **UI** | `PortalDashboard` composition |
| **Dynamize** | KPI values from `/dashboard/`; modules from catalog × auth |

### 1.36 `copilot.tsx` — `/copilot`
| | |
|--|--|
| **Dynamic?** | static → target live |
| **Models** | `EmbeddingIndex`, `SearchQueryLog`, `VoiceTranscript` |
| **API** | `/search/` + AI endpoints |
| **Service** | AI / `social_service.upsert_embedding` |
| **UI** | Chat **form**/pane stub |
| **Dynamize** | Stream answers from backend; log queries |

### 1.37 `README.md`
| | |
|--|--|
| **Dynamic?** | n/a (docs) |
| **Dynamize** | Routing conventions only |

---

## 2. Components

### 2.1 Layout

| File | Dynamic? | Models / API | UI | Dynamize |
|------|----------|--------------|-----|----------|
| `components/layout/AppShell.tsx` | live | `/menus/`, modules, auth, dept scope | Sidebar, top bar, bottom nav, ⌘K palette, copilot FAB | Prefer DB menus; capability filter |
| `components/layout/nav-items.ts` | static fallback | — | PRIMARY/WORKSPACE/CONSUMER/ADMIN/SYSTEM nav constants | Override with API menus |

### 2.2 Portals

| File | Dynamic? | Models / API | UI | Dynamize |
|------|----------|--------------|-----|----------|
| `components/portals/PortalDashboard.tsx` | live | portal-catalog + dashboard KPI keys | Module grids, feature links, KPI strip | Values from API; hide by `hasModule` |

### 2.3 UI bits

| File | Dynamic? | Role |
|------|----------|------|
| `components/ui-bits/Badge.tsx` | live | `StatusBadge`, `PriorityBadge`, `Tag` — enum → color |
| `components/ui-bits/QueryState.tsx` | live | Loading / error / empty wrapper for all API pages |

### 2.4 Theme

| File | Dynamic? | Role |
|------|----------|------|
| `components/theme-provider.tsx` | local OK | Dark/light; optional persist via settings |

### 2.5 Shadcn UI primitives (`components/ui/*`)

All **static primitives** (no domain data). Used by dynamic forms/tables:

`accordion`, `alert`, `alert-dialog`, `aspect-ratio`, `avatar`, `badge`, `breadcrumb`, `button`, `calendar`, `card`, `carousel`, `chart`, `checkbox`, `collapsible`, `command`, `context-menu`, `dialog`, `drawer`, `dropdown-menu`, `form`, `hover-card`, `input`, `input-otp`, `label`, `menubar`, `navigation-menu`, `pagination`, `popover`, `progress`, `radio-group`, `resizable`, `scroll-area`, `select`, `separator`, `sheet`, `sidebar`, `skeleton`, `slider`, `sonner`, `switch`, `table`, `tabs`, `textarea`, `toggle`, `toggle-group`, `tooltip`

**Dynamize:** Do not put business rules here. Compose via MetadataForm renderer + domain pages.

---

## 3. Hooks

| File | Dynamic? | Binds |
|------|----------|-------|
| `hooks/use-domain.ts` | live | All `domainApi` GET hooks (dashboard → rnd) |
| `hooks/use-enterprise.ts` | live | Menus, tasks, statuses, mission, dashboard, search, mutations |
| `hooks/use-mobile.tsx` | local | Breakpoint helper |

**Dynamize:** Add mutation hooks per domain as services gain HTTP endpoints (mirror `useTaskMutations` / HR mutations).

---

## 4. Lib

| File | Dynamic? | Role | Dynamize |
|------|----------|------|----------|
| `lib/api.ts` | live | JWT fetch, refresh | Keep single HTTP entry |
| `lib/auth.tsx` | live | User, modules, `can()` | From `/auth/me/` |
| `lib/domain-api.ts` | live | Domain GET clients | Add POST/PATCH action methods → services |
| `lib/domain-types.ts` | live | DTO types | Stay aligned with serializers/models |
| `lib/enterprise-api.ts` | live | Enterprise CRUD | Extend with approvals if needed |
| `lib/hr-api.ts` | live | HR CRUD + actions | Already service-aligned |
| `lib/company-api.ts` | live | Company/gov/jobs | Keep |
| `lib/process-types.ts` | live | Process dashboard DTOs | Match `process_dashboard_service` |
| `lib/modules.ts` | live | Icon + `modulesToNav` | Icons static map OK |
| `lib/portal-catalog.ts` | partial | Portal module **labels** | KPI values from API |
| `lib/department-menus.ts` | partial | Dept hash menus | Migrate to `MenuItem` |
| `lib/colors.ts` | static | Chart/brand tokens | OK (`design.md`) |
| `lib/format.ts` | static | Date/NPR formatters | OK |
| `lib/utils.ts` | static | `cn` helpers | OK |
| `lib/error-*.ts` / `lovable-error-reporting.ts` | infra | Error reporting | OK |

**Note:** `lib/dummy-data.ts` does **not** exist — do not reintroduce static domain fixtures.

---

## 5. App entry / styles / generated

| File | Dynamic? | Note |
|------|----------|------|
| `router.tsx` | generated/config | Route tree wiring |
| `routeTree.gen.ts` | generated | Do not hand-edit |
| `start.ts` / `server.ts` | infra | TanStack Start |
| `styles.css` | static tokens | CSS variables per `design.md` |

---

## 6. Cross-cutting UI patterns (all pages)

| Pattern | Implementation rule |
|---------|---------------------|
| **Page shell** | `AppShell` + title/subtitle (subtitle may cite model path e.g. `hr.employee`) |
| **Async gate** | `QueryState` around data |
| **KPI strip** | 2×2 / 4-col mini cards from API aggregates |
| **Mobile list** | Card stack; desktop = `table` |
| **Status** | `StatusBadge` with server enum string |
| **Money** | `fmtNPR` / format helpers |
| **Actions** | Disabled when `!can(module, action)` or API policy deny |
| **Empty** | QueryState empty — never fake rows |

---

## 7. Department hash sections (must stay model-aligned)

From `department-menus.ts` + route sections:

| Route | Hash / section | Model |
|-------|----------------|-------|
| `/hr` | overview, positions, employees, vacancies, applicants, onboarding, training, attendance, leave, payroll | `hr.*` |
| `/process` | overview, templates, definitions, stages, workorders, runs | `production.process_*`, `WorkOrder` |
| Other dept homes | menus in `department-menus.ts` | `models.md` §15–22 |

---

## 8. Priority order to finish 100% dynamization

1. Fix **Process** binding: implement HTTP for `process_dashboard_service` / `process_service` and `domainApi.processAction` (currently broken/missing).  
2. Wire **mutations** on procurement → GRN → stock → quality → sales/dispatch → finance (ER chains in `models_logic.md`).  
3. Replace approximate QC/release UI math with server fields.  
4. Persist **chat send**, feed engage, notification dismiss, KYC review (UI stubs today).  
5. MetadataForm-driven create/edit for remaining masters/transactions.  
6. Migrate static nav fallbacks to `MenuItem` + capabilities; prefer `/v2/*` and `/hr/*` over legacy GETs for writes.  
7. Copilot + commerce checkout.

---

*This inventory is the checklist for making every `web/src` file a dynamic projection of BEOS models and services — no duplicate business rules in the UI.*
