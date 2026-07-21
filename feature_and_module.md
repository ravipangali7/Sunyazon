# Sunyazon / BEOS — Features & Modules Reference

**Document purpose:** Exhaustive feature, module, capability, form field, workflow, dashboard, and API reference for implementation. Synthesized from all extracted Sunyazon source documents.

---

## Table of Contents

1. [Platform Core Features](#1-platform-core-features)
2. [Core Platform Engines (Module Detail)](#2-core-platform-engines-module-detail)
3. [Business Capability Catalog](#3-business-capability-catalog)
4. [Dynamic Form & Metadata System](#4-dynamic-form--metadata-system)
5. [Workflow Engine Features](#5-workflow-engine-features)
6. [Frontend & Workspace Features](#6-frontend--workspace-features)
7. [API & Integration Features](#7-api--integration-features)
8. [Security & Identity Features](#8-security--identity-features)
9. [Database & Data Model Features](#9-database--data-model-features)
10. [AI & Intelligence Features](#10-ai--intelligence-features)
11. [Department ERP Modules](#11-department-erp-modules)
    - [11.3 Procurement — ERP Forms & Fields](#113-procurement-module--erp-forms--field-specifications)
    - [11.4 Production — ERP Forms & Fields](#114-production-module--erp-forms--field-specifications)
    - [11.5 QA/QC — ERP Forms & Fields](#115-qaqc-module--erp-forms--field-specifications)
    - [11.6 Stores & Inventory — ERP Forms & Fields](#116-stores--inventory-module--erp-forms--field-specifications)
12. [HR Module — Forms, Fields & Database Schema](#12-hr-module--forms-fields--database-schema)
13. [Finance Module — Forms & Workflows](#13-finance-module--forms--workflows)
14. [Sales & Marketing Module](#14-sales--marketing-module)
15. [Logistics Module](#15-logistics-module)
16. [Maintenance & Engineering Module](#16-maintenance--engineering-module)
17. [IT & Digital Transformation Module](#17-it--digital-transformation-module)
18. [R&D Module](#18-rd-module)
19. [CEO & Executive Dashboards](#19-ceo--executive-dashboards)
20. [Governance, Risk & Compliance Features](#20-governance-risk--compliance-features)
21. [Mobile Applications](#21-mobile-applications)
22. [Future / Roadmap Features](#22-future--roadmap-features)
23. [Master Forms Register (Cross-Department)](#23-master-forms-register-cross-department)

---

## 1. Platform Core Features

### 1.1 Multi-Tenant Platform

| Feature | Detail |
|---------|--------|
| Multi Company | Holding → subsidiary structures |
| Multi Organization | Manufacturer, dealer, retailer, supplier, logistics, consumer as separate orgs |
| Multi Factory / Branch / Warehouse | Hierarchical org tree |
| Data isolation | Shared platform, separate data per tenant; Tenant ID + Organization ID on every record |
| Per-org configuration | Own forms, workflows, rules, reports on shared engines |
| Capability enable/disable | Retail org may disable Production capability |

### 1.2 Mission-Driven UX

| Feature | Detail |
|---------|--------|
| Today's Mission | Shown at login instead of empty dashboard |
| Auto task delivery | System assigns work based on events, role, SLA |
| Pending tasks | Prioritized queue with due dates |
| Approvals inbox | Multi-level approval actions |
| Alerts | Stock, quality, cash, maintenance, compliance |
| AI Copilot | Contextual on every screen |
| Performance indicators | Role-specific KPIs at login |

### 1.3 Event-Driven Architecture

Events propagate across capabilities: `Order Created → Inventory Reserved → Production Planned → Dispatch Scheduled → Invoice Generated → Payment Received`.

Subscribers: any enabled capability; AI uses event store for prediction.

**Backend ownership:** Domain events are applied by `server/core/services/*` (see `models_logic.md`). Frontend Approve/Reject/Return and stock displays must call APIs that invoke these services — never mutate ledger/payment/status client-side.

### 1.4 No-Code / Low-Code Configuration

Admins configure via builders; developers build engines only:

- Form Builder
- Workflow Builder
- Role Builder
- Menu Builder
- Report Builder
- Rule Builder

Metadata versioned with rollback support.

### 1.5 Domain service catalog (implementation)

| Module file | Key APIs |
|-------------|----------|
| `workflow_service.py` | `start_workflow`, `decide_approval`, `escalate_sla_breach`, `apply_rule_action` |
| `kyc_service.py` | `verify_kyc`, `set_default_address`, `setup_consumer_user` |
| `org_setup_service.py` | `install_industry_template`, `set_capabilities`, `sign_board_declaration`, `complete_meeting` |
| `checkout_service.py` | `checkout`, `mark_payment_*`, `cancel_order`, `record_ad_impression` |
| `procurement_service.py` | `submit_pr`, `approve_pr`, `approve_po`, `send_po`, `cancel_po` |
| `grn_service.py` | `receive_grn`, `post_grn`, `issue_material` |
| `stock_service.py` | `post_ledger`, `approve_stock_adjustment` |
| `process_service.py` | `release_work_order`, `start/complete_run_stage`, `commit_run_line` |
| `qa_service.py` | `record_incoming_inspection`, `final_qa_release`, `open_ncr`, `close_capa` |
| `dispatch_service.py` | `approve_sales_order`, `create_dispatch`, `mark_dispatched`, `create_pod` |
| `finance_service.py` | `post_journal_voucher`, `record_purchase_payment`, `clear_cheque`, `generate_pnl_snapshot` |
| `leave_service.py` | `approve_leave`, `reject_leave`, `exit_employee` |
| `payroll_service.py` | `process_payroll`, `approve_payroll`, `pay_payroll` |
| `hr_recruitment_service.py` | `publish_vacancy`, `hire_applicant`, `evaluate_training` |
| `crm_service.py` | `register_complaint`, `advance_complaint`, `mark_deal_won` |
| `maintenance_service.py` | `create_pm_work_orders_due`, `close_maintenance_wo`, `record_calibration` |
| `social_service.py` | `publish_feed_post`, `post_chat_message`, `upsert_embedding`, `write_kpi_snapshot` |

Signals: `notification_signal` (task assign), `embedding_signal` (Product/Document reindex).

---

## 2. Core Platform Engines (Module Detail)

### 2.1 Identity Engine

**Manages:** User, Employee, Supplier, Dealer, Consumer, AI Agent, Machine, IoT Device.

**Functions:** Login, Logout, Password, MFA, Session, Token, Digital Identity.

**Actor attributes:** Authority, Responsibility, Approval limit, Task list, KPI, Performance rating.

### 2.2 Organization Engine

**Entities:** Company, Branch, Department, Team, Position, Reporting Hierarchy.

**Organization attributes:** Organization ID, Parent Organization, Organization Type, Business Category, Country, Currency, Policies, Calendar.

### 2.3 Metadata Engine

**Generates at runtime:** Form layout, Field definitions, Menu structure, Validation rules, Report definitions, Dashboard widgets, Permission mappings, Workflow bindings.

**Governance:** Metadata changes require approval, version tracking, audit log, rollback.

### 2.4 Business Object Engine

**Standard object structure:** ID, Fields, Validation, Relationships, Version, Audit, API, Workflow hooks.

**Object categories:** Master, Transaction, Reference, Configuration, Knowledge.

**Object lifecycle:** Draft → Validated → Approved → Active → Suspended → Archived → Disposed.

**Object events:** Created, Updated, Approved, Rejected, Completed, Cancelled (domain-specific).

**Core business objects:**

| Object | Key relationships |
|--------|-------------------|
| Employee | Organization, Department, Position, Tasks |
| Product | BOM, Recipe, Batch, Warehouse |
| Customer | Sales Order, Invoice, Complaint, Credit Limit |
| Supplier | Purchase Order, GRN, QC, Payment |
| Sales Order | Customer, Items, Dispatch, Invoice |
| Purchase Order | Supplier, Items, GRN, Payment |
| Production Order | BOM, Batch, Machine, QC |
| Batch | Production Order, QC Result, Expiry |
| Machine/Asset | Maintenance Work Order, OEE, Calibration |
| Invoice | Order, Payment, Tax |
| Complaint | Customer, Product, CAPA |
| Leave Request | Employee, Approval Workflow |
| Work Order | Asset, Technician, Spare Parts |

### 2.5 Workflow Engine

See [Section 5](#5-workflow-engine-features).

### 2.6 Rule Engine

Runtime-evaluated rules (not hardcoded). Examples:

- If Stock < Minimum → Create Purchase Request
- If Invoice > Credit Limit → Block Dispatch
- If Product Expiry < 30 Days → Block Sales
- If Purchase Amount > 500,000 → Director Approval step added

### 2.7 Policy Engine

Company decisions separate from logic rules. Example: "Purchase > NPR 10,00,000 requires CEO Approval" — changeable at runtime without code deploy.

### 2.8 Mission Engine

Converts business goals to daily missions per role:

- Production Manager: "Produce 5000 units", "Resolve 2 QC issues", "Approve 5 requests"
- CEO: Revenue, cash flow, risk, approvals, AI insights

### 2.9 Task Engine

**Task fields:** Priority, Due Date, Checklist, Evidence, Attachments, Comments, Related Documents, Related Workflow.

**Task states:** New → Assigned → Accepted → In Progress → Pending Approval → Completed → Verified → Closed.

### 2.10 Approval Engine

**Modes:** Single, Multi-Level, Parallel, Delegation, Auto Approval, Escalation, Rejection, Return for Correction.

**Integrated with:** Workflow Engine, Policy Engine, Notification Engine, Audit Engine.

### 2.11 Notification Engine

**Channels:** Email, SMS, Push, In-App, WhatsApp (future).

**Types:** Task, Approval, Reminder, Escalation, Warning, Emergency, AI Recommendation, Compliance Alert.

### 2.12 Knowledge Engine

**Content types:** SOP, Manual, Training, Lessons Learned, FAQ, Best Practice, AI Knowledge Base.

**Features:** Version control, search integration, AI summarization, role-based access.

### 2.13 Search Engine

Global Search, AI Search, Knowledge Search — via dedicated search index (not operational DB queries).

### 2.14 AI Engine

See [Section 10](#10-ai--intelligence-features).

### 2.15 Audit Engine

**Captured per action:** Who, What, When, Where, Why, Before Value, After Value, Device, IP Address. Immutable; no delete.

### 2.16 Reporting Engine

User-defined: Fields, Filters, Grouping, Sorting, Visualization. Reports generated from metadata, not hardcoded.

### 2.17 Integration Engine

Banking, Government APIs, SMS, Email, Payment Gateway, Marketplace, IoT, ERP Connectors via Integration Gateway.

---

## 3. Business Capability Catalog

### 3.1 Manufacturing Domain

| Capability | Inputs | Outputs | KPIs |
|------------|--------|---------|------|
| BOM Management | Product, Raw materials | BOM version | BOM accuracy |
| Recipe Management | Formula, Ingredients | Approved recipe | Trial success rate |
| Production Planning | Demand forecast, Capacity | Production plan | Plan achievement ≥98% |
| Batch Management | Production order, Recipe | Batch record, Batch number | Yield ≥98% |
| Machine Scheduling | Orders, Machine capacity | Schedule | OEE ≥85% |
| Production Monitoring | Sensor/operator data | Output, Downtime | Downtime ≤3% |
| QC (process) | Batch, Samples | QC sheet, Pass/Fail | Rejection ≤1% |
| Packaging | Finished batch | Packaged FG | Waste control |
| Dispatch | Sales order, FG stock | Dispatch note | OTIF ≥98% |

### 3.2 Supply Chain / Procurement Domain

| Capability | Workflow summary |
|------------|------------------|
| Demand Planning | Forecast → Plan → Approval |
| Sourcing & Vendor Development | Vendor identification → Evaluation → Approval |
| Purchase Requisition | Request → Manager → Finance → PO |
| Purchase Order | PO → Supplier → GRN → QC → Stock → Invoice → Payment |
| Import/LC Management | PO → LC Opening → Shipment → Settlement |
| Supplier Performance | On-time, quality, cost KPI tracking |

### 3.3 Warehouse / Inventory Domain

| Capability | Key processes |
|------------|---------------|
| GRN (Goods Receipt) | Receive → QC gate → Stock In |
| Material Issue | Requisition → Issue → Stock Out |
| FEFO/FIFO Control | Expiry-based picking |
| Stock Audit | Physical check → Variance → Adjustment |
| Inventory Valuation | FIFO / Weighted Average |
| Smart Warehouse | Barcode, RFID, Real-time tracking (roadmap) |

### 3.4 Sales Domain

| Capability | Key processes |
|------------|---------------|
| Lead Management | Lead → Qualification → Conversion |
| Quotation | Quote → Approval → Send |
| Order Booking | Order → Verification → Dispatch → Invoice |
| Invoice & Collection | Invoice → Ledger → Collection → Reconciliation |
| Customer Follow-up | CRM activities, complaint linkage |
| Distributor Management | Appointment → Agreement → Performance review |
| Key Account Management | Negotiation → Contract → SLA monitoring |
| Export Sales | Documentation → Shipment → Settlement |

### 3.5 CRM Domain

| Capability | Detail |
|------------|--------|
| Customer master | Credit limit, territory, channel class |
| Complaint handling | Register → Investigate → CAPA → Closure (≤48 hrs target) |
| Customer satisfaction | Surveys, NPS, repeat purchase tracking |
| Escalation matrix | Customer Care 4h → Sales Manager 24h → QA 48h → CEO critical |

### 3.6 HR Domain

| Capability | Workflow |
|------------|----------|
| Manpower Planning | Dept request → HR review → Budget → CEO → Recruitment |
| Recruitment | Requisition → Approval → Advertisement → Screening → Interview → Selection → Appointment |
| Onboarding | Joining → Orientation → Documentation → Dept induction |
| Attendance | Biometric → Shift → OT calculation |
| Leave | Request → Supervisor/Manager/Director (by duration) |
| Payroll | Attendance → Leave adj → OT → Processing → Approval → Bank transfer |
| Performance | Goal setting → Mid-year → Final review → Rating → Reward |
| Training | TNA → Plan → Delivery → Evaluation (4 levels) |
| Exit | Resignation → Clearance → Exit interview → Final settlement |

### 3.7 Finance Domain

| Capability | Workflow |
|------------|----------|
| General Ledger | Transaction → Voucher → Verification → Approval → Posting |
| Accounts Payable | Supplier invoice → Verification → Approval → Payment |
| Accounts Receivable | Sales invoice → Collection → Reconciliation |
| Budget Management | Dept budget → Finance review → Management approval → ERP upload → Monitoring |
| Cost Accounting | RM + Processing + Packaging + Wastage + Labor + Overhead = Product Cost |
| Tax (VAT/TDS/Income) | Transaction → Deduction → Deposit → Return filing |
| Treasury | Cash forecast → Inflow/outflow → Working capital |
| Fixed Assets | Purchase → Tagging → ERP entry → Depreciation |
| CAPEX | Need → Technical eval → Financial feasibility → CEO → Board (per DOA) |

### 3.8 Maintenance Domain

| Capability | Detail |
|------------|--------|
| Preventive Maintenance | Daily inspect → Weekly lube → Monthly calibration → Quarterly overhaul → Annual major |
| Breakdown Maintenance | Report → Diagnosis → Repair → Test → Release (critical: 15 min response) |
| Predictive Maintenance | Vibration, thermal, oil analysis |
| Work Order | Request → Approval → Execution → Closure |
| Spare Parts | Min stock → Reorder → Purchase request |
| Calibration | Weighing scale (monthly), Thermometer (quarterly), pH meter (monthly) |
| TPM | 8 pillars including autonomous maintenance, OEE target ≥85% |

### 3.9 Quality Domain

| Capability | Detail |
|------------|--------|
| Incoming QC | Material inspection → Inspection report |
| Process QC | Production check → QC sheet |
| Final QC / Release | FG approval → Release report |
| HACCP/GMP Compliance | Audit readiness, CAPA closure |
| Laboratory | Test records, calibration traceability |
| Food safety | Batch release, recall prevention (target: 0 recalls) |

### 3.10 R&D Domain

| Capability | Detail |
|------------|--------|
| Idea Management | Idea bank → Evaluation → Development |
| Recipe/Formula Development | Ingredient selection → Formulation → Trial → Evaluation |
| Trial Batch | Lab → Pilot → Commercial trial |
| Sensory Evaluation | Taste, aroma, texture, appearance |
| Shelf Life Study | Real time + accelerated |
| Packaging Development | Material eval → Label → Compliance |
| Product Launch | Stage-gate: 5 gates from idea to launch |
| Technology Transfer | R&D → Production → QA validation → Commercial |

### 3.11 IT / Digital Domain

| Capability | Detail |
|------------|--------|
| ERP Administration | User access, module config, reporting |
| Helpdesk | Ticket → Assignment → Resolution (SLA by priority) |
| Backup & DR | Daily backup → Verification → Recovery test |
| Cyber Security | Endpoint, firewall, SOC, pen test (annual) |
| BI Dashboards | Production, Sales, Finance, Inventory, HR |
| DMS | SOP, policies, contracts, HR files |
| IoT / Smart Factory | Machine → Sensor → ERP → Dashboard |
| AI Governance | Approved use cases, risk management |

---

## 4. Dynamic Form & Metadata System

### 4.1 Form Generation Model

Forms are **never hardcoded**. Generated at runtime from metadata bound to Business Objects.

**Example — Purchase Order form fields:**

| Field | Type | Validation |
|-------|------|------------|
| Supplier | Dropdown (FK) | Active supplier, approved vendor |
| Item List | Multi-row | Product master reference |
| Quantity | Number | > 0, UOM check |
| Price | Currency | Policy limit, historical comparison |
| Approval Status | Read-only | Workflow-driven |
| Delivery Date | Date | ≥ today |
| Terms | Text/Dropdown | Payment terms reference |
| Attachments | File Upload | Quote, specification |
| Total Amount | Calculated | Triggers conditional approval workflow |

### 4.2 Supported Field Types (Platform-Wide)

| Type | Use case |
|------|----------|
| Text | Names, descriptions |
| Number | Quantities, counts |
| Date / DateTime | Schedules, expiry |
| Currency | Amounts multi-currency |
| Dropdown | Master data reference |
| Multi-select | Categories, tags |
| Boolean | Yes/No flags |
| File Upload | Documents, certificates |
| Image | Photos, evidence |
| Video | Training, evidence |
| Barcode | Scan input |
| QR Code | Scan input |
| RFID | Warehouse/asset tracking |
| GPS | Field visit, delivery proof |
| Signature | POD, approvals |
| Rich Text | Notes, SOP content |

### 4.3 Smart Form Features

When selecting related entities, form auto-shows context:

- **Supplier selected →** Previous price, outstanding balance, quality rating, AI recommendation
- **Customer selected →** Credit limit, outstanding, order history
- **Product selected →** Stock level, batch availability, expiry

### 4.4 Validation Levels

1. **Field:** Format (email, phone, numeric range)
2. **Business:** Expiry date > production date
3. **Cross-domain:** Customer must be active for sales order
4. **Policy:** Credit limit exceeded → block dispatch

### 4.5 Permission on Forms

Permissions derived from: Role + Department + Branch + Data Attribute.

Example: Production Manager sees only Kathmandu branch data.

---

## 5. Workflow Engine Features

### 5.1 Workflow Components

Every workflow includes: Workflow ID, Name, Version, Owner, Trigger, Start Event, End Event, Steps, Roles, Rules, SLA, Notifications, Escalation, Audit Trail.

### 5.2 Workflow Types

| Type | Description |
|------|-------------|
| Manual | Human completes each step |
| Automated | System auto-executes steps |
| AI Assisted | AI recommends; human/policy decides |
| Hybrid | Human + AI + Automation combined |

### 5.3 Workflow Triggers

New Order, Purchase Request, Low Stock, Complaint, Machine Breakdown, Employee Joining, Leave Request, Payment Due, Contract Expiry, Customer Registration, Sensor Alert (IoT), AI Prediction.

### 5.4 Standard Workflow Lifecycle

Design → Review → Approval → Publish → Execute → Monitor → Optimize → Archive.

### 5.5 Purchase Workflow (Full Chain)

```
Create Request → Manager Review → Budget Validation → Finance Approval
→ Vendor Selection → Purchase Order → Goods Receive → Quality Inspection
→ Stock Update → Invoice Verification → Payment → Close
```

**Conditional branch:** Amount thresholds route to Supervisor / Manager / Director / CEO per DOA.

### 5.6 Sales Order Workflow

```
Order → Verification → Credit check → Approval → Picking → Loading
→ Dispatch → Delivery → POD → Invoice → Collection → Close
```

### 5.7 HR Recruitment Workflow

```
Vacancy Alert → HR Request → Approval → Advertisement → Auto-Screening
→ Interview Panel → Scoring → Offer → Digital Onboarding → Employee Record
```

### 5.8 New Product Launch Workflow

```
Market Research → Business Case → R&D Development → Financial Evaluation
→ Pilot Production → Marketing Plan → CEO Approval → Commercial Launch
```

### 5.9 SLA & Escalation

Workflow SLA per step; escalation engine notifies next authority on breach.

### 5.10 Cross-Organization Workflow

Manufacturer ↔ Distributor ↔ Retailer workflows linked on shared platform with data isolation.

---

## 6. Frontend & Workspace Features

### 6.1 Workspace Types

| Workspace | Primary users | Key widgets |
|-----------|---------------|-------------|
| Executive | CEO, Directors | Revenue, cash, risk, approvals, AI insights |
| Employee | All staff | Today's mission, tasks, leave, training |
| Production | Plant managers, operators | Machine status, output, QC pending, maintenance alerts |
| Warehouse | Storekeepers | Stock levels, GRN, picking, expiry |
| HR | HR team | Headcount, recruitment, attendance, payroll calendar |
| Finance | Finance team | Cash position, AP/AR, budget variance |
| Sales | Sales force | Targets, routes, orders, collection |
| AI | All roles | Copilot panel on every screen |
| Consumer | End customers | Orders, complaints, feedback |
| Supplier | Vendors | PO, delivery schedule, invoices |
| Dealer | Distributors | Orders, inventory, schemes |
| Retail | Retailers | POS, stock, promotions |

### 6.2 Login / My Work Center Components

1. Today's Mission
2. Pending Tasks
3. Approvals
4. Alerts
5. Meetings
6. AI Assistant
7. Notifications
8. Performance
9. Goals

### 6.3 Adaptive Navigation

Menu generated from: Role, Department, Enabled Capabilities, Organization, Permission, Device, Language.

### 6.4 AI Copilot Actions

- Explain Policy
- Summarize Report
- Suggest Action
- Find SOP
- Generate Reply
- Predict Delay

### 6.5 Notification Center Types

Task, Approval, Reminder, Escalation, Warning, Emergency, AI Recommendation, Compliance Alert.

### 6.6 Offline & Mobile

Offline-first for field workers (sales routes, attendance, delivery POD). Mobile-first design for operators, drivers, sales reps.

---

## 7. API & Integration Features

### 7.1 API Categories

| Category | Endpoints (conceptual) |
|----------|------------------------|
| Core Platform | Auth, Organization, Users, Roles, Permissions, Settings, Notifications |
| Business | Sales, Purchase, Manufacturing, Warehouse, HR, Finance, CRM, Maintenance, Projects |
| Workflow | Create, Assign, Approve, Reject, Escalate, Complete |
| AI | Recommendation, Forecast, Knowledge Search, OCR, Vision, Speech, Translation |
| Integration | Banking, Government, SMS, Email, Payment, Marketplace, IoT |

### 7.2 Sales Capability API Example

```
Create Order → Approve Order → Cancel Order → Track Order
```

### 7.3 Request Headers (Required)

Tenant ID, Organization ID, Actor ID, Request ID, Correlation ID, Timestamp, Language, Timezone, API Version.

### 7.4 Response Standard

Status, Message, Data, Validation Errors, Warnings, Correlation ID, Execution Time.

### 7.5 Integration Gateway

External systems connect through Integration Hub above API Gateway — not direct DB.

### 7.6 Event-Driven API Pattern

APIs publish events consumed by other capabilities (pub/sub model).

---

## 8. Security & Identity Features

### 8.1 Authentication Methods

Username+Password, OTP, Authenticator App, Biometric, Smart Card, Passkey (future), Digital Certificate, SSO.

**Password policy (Sunyzon IT):** Minimum 12 characters, complex, 90-day change.

### 8.2 Authorization Model

| Level | Example |
|-------|---------|
| Role-Based | CEO, HR Manager, Store Officer |
| Attribute-Based | Branch, Department, Shift, Product Line |
| Policy-Based | No approval after 10 PM; foreign login requires extra verification |

### 8.3 Access Control Levels (ERP Users)

Read, Entry, Approval, Administration.

### 8.4 Sensitive Data Protection

Salary, Bank Account, Government ID, API Secrets, AI Credentials — column encryption + restricted access.

### 8.5 Document Security

Version control, read/download/print permissions, watermark, digital signature, expiry control.

### 8.6 RBAC Logic (Shunyajon Spec)

| Role | Access |
|------|--------|
| महाप्रबन्धक | All department reports, financial details |
| प्रबन्धक | Own department attendance approval, budget execution |
| शाखा प्रमुख | Branch daily operations (sales, lab reports) |
| सहयोगी/सुरक्षा | Own attendance, job-specific logs (e.g., vehicle logbook) |

---

## 9. Database & Data Model Features

### 9.1 Master Data Entities

Organization, Employee, Supplier, Dealer, Customer, Consumer, Product, Warehouse, Machine, Asset, Vehicle, Currency, Tax, Unit of Measure.

### 9.2 Transaction Data Entities

Sales Order, Purchase Order, Invoice, Payment, Production Order, QC Result, Attendance, Leave Request, Complaint, Work Order, GRN, Dispatch Note.

### 9.3 Reference Data

Country, Province, District, City, Currency, Language, Product Category, Department Type, Risk Category.

### 9.4 Configuration Data

Roles, Permissions, Workflow definitions, Business Rules, Policies, Form Layout, Dashboard Layout.

### 9.5 HR Database Tables (Shunyajon App Spec)

#### Position_Master

| Field | Type | Description |
|-------|------|-------------|
| pos_id | PK Int | Position ID |
| designation | String | Job title |
| department | String | Department name |
| min_edu | String | Minimum education |
| experience | String | Required experience |
| reports_to | FK Int | Reporting position ID |

#### Job_Vacancies

| Field | Type | Description |
|-------|------|-------------|
| vacancy_id | PK Int | e.g., VAC-2026-01 |
| target_pos_id | FK Int | Links to Position_Master |
| open_date | Date | Application open date |
| close_date | Date | Application deadline |
| hiring_manager | FK EmpID | Interview lead |
| status | Enum | Draft, Active, Closed, Fulfilled |

#### Job_Applicants

| Field | Type | Description |
|-------|------|-------------|
| app_id | PK Int | Applicant ID |
| full_name | String | Applicant name |
| applied_for | FK Int | vacancy_id |
| edu_doc | File/URL | Certificate |
| exp_years | Decimal | Total experience |
| cv_link | URL | CV |
| current_stage | Enum | Applied, Shortlisted, Interviewed, Rejected, Hired |

#### Selection_Scoring

| Field | Type | Description |
|-------|------|-------------|
| applicant_ref | FK | Applicant |
| interviewer | FK EmpID | Interviewer |
| score | Int (1-100) | Interview score |
| remarks | String | Comments |
| status | Enum | Hired, Waitlist, Rejected |

#### Onboarding_Process

| Field | Type | Description |
|-------|------|-------------|
| offer_letter | PDF/URL | Generated appointment letter |
| joined_date | Date | Start date |
| probation_period | Integer | Months (e.g., 6) |
| gurukul_status | FK | Training course completion |

#### Employee_Onboarding_Tasks

| Field | Type | Description |
|-------|------|-------------|
| task_id | PK Int | Task ID |
| emp_id | FK | Employee reference |
| task_name | String | e.g., SOP Reading |
| due_date | Date | Deadline |
| is_completed | Boolean | Completion flag |
| manager_remark | String | Supervisor feedback |

#### Training_Logs_Table

Tracks Gurukul course completion, exam scores, certification status per employee.

#### Branch_Operations

Branch-specific operational flags: qual_check_status (Pass/Fail), dev_milestone, bug_report, consumer_feedback, ad_performance, vendor_list, procurement_cost.

### 9.6 Multi-Tenant Record Context

Every record: Tenant ID, Organization ID, Branch ID (where applicable).

### 9.7 Soft Delete

Status: Active, Inactive, Archived, Deleted (logical). Physical delete extremely limited.

---

## 10. AI & Intelligence Features

### 10.1 AI as Native Layer (Not Separate Module)

AI assists but does not replace policy/workflow decisions.

### 10.2 AI Use Cases by Domain

| Domain | AI function |
|--------|-------------|
| Sales | Demand forecast, territory optimization |
| Production | Utilization suggestion, delay prediction, schedule optimization |
| Inventory | Stock optimization, slow-moving detection |
| Maintenance | Predictive failure, PM scheduling |
| HR | Attrition risk, training recommendation |
| Finance | Cash flow forecast, anomaly detection |
| CRM | Sentiment analysis, complaint categorization |
| Platform | Form improvement suggestion, workflow bottleneck detection, report auto-generation |

### 10.3 Approved AI Applications (Sunyzon IT Policy)

Report generation, Forecasting, Analytics, Customer support.

### 10.4 AI Risk Controls

Data leakage prevention, incorrect output validation, compliance failure monitoring, human decision final authority.

### 10.5 AI + Metadata Integration

- Suggest form improvements
- Optimize workflows
- Detect bottlenecks
- Recommend approval routing changes
- Auto-generate reports

---

## 11. Department ERP Modules

### 11.1 Module Map (Sunyzon IT Manual)

| ERP Module | Sub-processes | Data owner |
|------------|---------------|------------|
| Production | Planning, manufacturing, packaging, batch | Factory Director |
| Procurement | Requisition, PO, GRN, vendor | Procurement Head |
| Inventory | GRN, issue, audit, valuation | Store Manager |
| Quality | Incoming, process, final QC, lab | QA Manager |
| Sales & Distribution | Order, dispatch, invoice, collection | Sales Director |
| Finance | GL, AP, AR, tax, treasury, costing | Finance Director |
| HR & Payroll | Recruitment, attendance, leave, payroll | HR Director |
| Maintenance | PM, breakdown, spares, calibration | Maintenance Manager |

### 11.2 Spreadsheet SOP Control Matrix

Each department SOP maps to a control report (see `Complete_Factory_Management_System_with_SOP.xlsx` Master SOP sheet).

### 11.3 Procurement Module — ERP Forms & Field Specifications

**Sources:** `Procurement_System.xlsx`, `PROCUREMENT & SUPPLY CHAIN MANAGEMENT.docx`, `PROCUREMENT MANAGEMENT.docx`

**End-to-end workflow:** PR → Approval → RFQ (min 3 quotes) → Comparative Statement → PO → GRN → QC → Invoice → Payment

#### Purchase Requisition (PR)

| Field Name | Field Type | Required | Notes |
|------------|------------|----------|-------|
| PR No | Auto-number (Text) | Required |  |
| Date | Date | Required |  |
| Department | Lookup (Department) | Required |  |
| Item Code | Text | Required |  |
| Material Description | Lookup (Material Master) | Required |  |
| Qty | Number (Decimal) | Required |  |
| Required Date | Date | Required |  |
| Status | Enum (Select) | Required | Workflow-driven lifecycle state |

#### RFQ Quotation

| Field Name | Field Type | Required | Notes |
|------------|------------|----------|-------|
| RFQ No | Auto-number (Text) | Required |  |
| Supplier | Lookup (Vendor Master) | Required |  |
| Item | Lookup (Item Master) | Required |  |
| Qty | Number (Decimal) | Required |  |
| Unit Price | Currency (NPR) | Required |  |
| Delivery Days | Number (Days) | Required |  |
| Payment Terms | Textarea | Required |  |
| Remarks | Textarea | Optional/Computed |  |

#### Comparative Statement (CS)

| Field Name | Field Type | Required | Notes |
|------------|------------|----------|-------|
| Item | Lookup (Item Master) | Required |  |
| Supplier A Price | Currency (NPR) | Required |  |
| Supplier B Price | Currency (NPR) | Required |  |
| Supplier C Price | Currency (NPR) | Required |  |
| Selected Supplier | Lookup (Vendor Master) | Required |  |
| Reason | Textarea | Required |  |

#### Purchase Order (PO)

| Field Name | Field Type | Required | Notes |
|------------|------------|----------|-------|
| PO No | Auto-number (Text) | Required |  |
| Supplier | Lookup (Vendor Master) | Required |  |
| Item | Lookup (Item Master) | Required |  |
| Qty | Number (Decimal) | Required |  |
| Rate | Currency (NPR) | Required |  |
| Amount | Currency (NPR) | Required |  |
| Delivery Date | Date | Required |  |
| Terms | Textarea | Required |  |

#### GRN Receiving

| Field Name | Field Type | Required | Notes |
|------------|------------|----------|-------|
| GRN No | Auto-number (Text) | Required |  |
| PO No | Auto-number (Text) | Required |  |
| Item | Lookup (Item Master) | Required |  |
| Ordered Qty | Number (Decimal) | Required |  |
| Received Qty | Number (Decimal) | Required |  |
| Accepted Qty | Number (Decimal) | Required |  |
| Rejected Qty | Number (Decimal) | Required |  |
| QC Status | Enum (Select) | Required | Workflow-driven lifecycle state |

#### Vendor Master

| Field Name | Field Type | Required | Notes |
|------------|------------|----------|-------|
| Vendor Name | Text | Required |  |
| Contact | Text (Phone/Email) | Required |  |
| Category | Enum (Select) | Required |  |
| Quality Rating | Number (1-100) | Required |  |
| Delivery Rating | Number (1-100) | Required |  |
| Overall Score | Number (1-100) | Required |  |

#### Inventory Reorder Alert

| Field Name | Field Type | Required | Notes |
|------------|------------|----------|-------|
| Item | Lookup (Item Master) | Required |  |
| Minimum Stock | Number | Required |  |
| Current Stock | Number | Required |  |
| Reorder Level | Number | Required |  |
| Order Qty | Number (Decimal) | Required |  |
| Alert | Enum (Computed) | Optional/Computed |  |

#### Procurement Dashboard

| Field Name | Field Type | Required | Notes |
|------------|------------|----------|-------|
| Target | Number/Percent | Required |  |
| Actual | Number/Percent | Required |  |
| Achievement % | Percent (Calculated) | Optional/Computed | Formula: (Actual/Target) x 100 |

**Additional manual forms:** Supplier Registration, Vendor Evaluation, Supplier Audit Checklist, Approved Vendor List (AVL), Vendor Performance Scorecard, Vendor Risk Assessment, Import Tracking, LC Request, Procurement Savings, SCAR, Contract Approval, Negotiation Record

**Procurement KPIs:** On-Time Delivery >95%, Cost Saving ≥5%, Supplier Quality >98%, Material Availability >99%, Purchase Cycle ≤7 days, Emergency Purchase <3%

### 11.4 Production Module — ERP Forms & Field Specifications

**Sources:** `Manufacturing_Production_System.xlsx`, `PRODUCTION DEPARTMENT MANUAL SOP.docx`

**SOP flow:** PPC Planning → MRP → Production Order → Manufacturing → In-Process QC → Packaging → Safety → FG Transfer

#### Work Order System

| Field Name | Field Type | Required | Notes |
|------------|------------|----------|-------|
| WO No | Auto-number (Text) | Required |  |
| Date | Date | Required |  |
| Product | Lookup (Product Master) | Required |  |
| Batch No | Auto-number (Text) | Required |  |
| Target Qty | Number (Decimal) | Required |  |
| Actual Qty | Number (Decimal) | Required |  |
| Waste | Number (Decimal) | Required |  |
| Status | Enum (Select) | Required | Workflow-driven lifecycle state |

#### Production Daily Report

| Field Name | Field Type | Required | Notes |
|------------|------------|----------|-------|
| Date | Date | Required |  |
| Product | Lookup (Product Master) | Required |  |
| Plan Qty | Number (Decimal) | Required |  |
| Produced Qty | Number (Decimal) | Required |  |
| Rejected Qty | Number (Decimal) | Required |  |
| Downtime | Duration (Hours) | Required |  |
| Remarks | Textarea | Optional/Computed |  |

#### Production KPI Dashboard

| Field Name | Field Type | Required | Notes |
|------------|------------|----------|-------|
| Target | Number/Percent | Required |  |
| Actual | Number/Percent | Required |  |
| Achievement % | Percent (Calculated) | Optional/Computed | Formula: (Actual/Target) x 100 |

#### BOM Master

| Field Name | Field Type | Required | Notes |
|------------|------------|----------|-------|
| Item Code | Text | Required |  |
| Finished Product | Lookup (Product Master) | Required |  |
| Raw Material | Lookup (Material Master) | Required |  |
| Qty Per Unit | Number (Decimal) | Required |  |
| Unit | Enum (UOM) | Required |  |
| Remarks | Textarea | Optional/Computed |  |

#### Batch Production

| Field Name | Field Type | Required | Notes |
|------------|------------|----------|-------|
| Batch No | Auto-number (Text) | Required |  |
| Product | Lookup (Product Master) | Required |  |
| Batch Size | Text | Required |  |
| Start Date | Date | Required |  |
| End Date | Date | Required |  |
| Supervisor | Lookup (User) | Required |  |
| Status | Enum (Select) | Required | Workflow-driven lifecycle state |

#### Raw Material Issue

| Field Name | Field Type | Required | Notes |
|------------|------------|----------|-------|
| Date | Date | Required |  |
| Work Order | Lookup (Work Order) | Required |  |
| Material | Lookup (Material Master) | Required |  |
| Required Qty | Number (Decimal) | Required |  |
| Issued Qty | Number (Decimal) | Required |  |
| Balance | Number (Calculated) | Optional/Computed | Auto-calculated from transactions |
| Store Approval | Text | Required |  |

#### WIP Tracking

| Field Name | Field Type | Required | Notes |
|------------|------------|----------|-------|
| Date | Date | Required |  |
| Opening WIP | Number | Required |  |
| Input | Text | Required |  |
| Output | Text | Required |  |
| Closing WIP | Number | Required |  |

#### Finished Goods

| Field Name | Field Type | Required | Notes |
|------------|------------|----------|-------|
| Date | Date | Required |  |
| Product | Lookup (Product Master) | Required |  |
| Batch No | Auto-number (Text) | Required |  |
| Produced Qty | Number (Decimal) | Required |  |
| Transfer Qty | Number (Decimal) | Required |  |
| Balance | Number (Calculated) | Optional/Computed | Auto-calculated from transactions |

#### Production Costing

| Field Name | Field Type | Required | Notes |
|------------|------------|----------|-------|
| Product | Lookup (Product Master) | Required |  |
| Material Cost | Currency (NPR) | Required |  |
| Labor Cost | Currency (NPR) | Required |  |
| Machine Cost | Currency (NPR) | Required |  |
| Total Cost | Currency (NPR) | Required |  |
| Per Unit Cost | Currency (NPR) | Required |  |

#### OEE Dashboard

| Field Name | Field Type | Required | Notes |
|------------|------------|----------|-------|
| Parameter | Text | Required |  |
| Target | Number/Percent | Required |  |
| Actual | Number/Percent | Required |  |
| Achievement % | Percent (Calculated) | Optional/Computed | Formula: (Actual/Target) x 100 |

**Production KPIs:** Plan Achievement ≥98%, OEE ≥85%, Downtime ≤3%, Yield ≥98%, Rejection ≤1%

### 11.5 QA/QC Module — ERP Forms & Field Specifications

**Sources:** `QC_QA_ERP_Management_System.xlsx`, `QUALITY ASSURANCE SOP.docx`

**QC flow:** Incoming Inspection → In-Process QC → Final QA Release; NCR → CAPA for non-conformance

#### QC Dashboard

| Field Name | Field Type | Required | Notes |
|------------|------------|----------|-------|
| Target | Number/Percent | Required |  |
| Actual | Number/Percent | Required |  |
| Achievement % | Percent (Calculated) | Optional/Computed | Formula: (Actual/Target) x 100 |

#### Incoming Inspection

| Field Name | Field Type | Required | Notes |
|------------|------------|----------|-------|
| Inspection No | Auto-number (Text) | Required |  |
| Date | Date | Required |  |
| Supplier | Lookup (Vendor Master) | Required |  |
| Material | Lookup (Material Master) | Required |  |
| Batch No | Auto-number (Text) | Required |  |
| Parameter | Text | Required |  |
| Result | Text/Number | Required |  |
| Status | Enum (Select) | Required | Workflow-driven lifecycle state |
| Inspector | Lookup (User) | Required |  |

#### In Process QC

| Field Name | Field Type | Required | Notes |
|------------|------------|----------|-------|
| Date | Date | Required |  |
| Product | Lookup (Product Master) | Required |  |
| Batch No | Auto-number (Text) | Required |  |
| Process Step | Text | Required |  |
| Parameter | Text | Required |  |
| Standard | Text/Number | Required |  |
| Actual | Number/Percent | Required |  |
| Status | Enum (Select) | Required | Workflow-driven lifecycle state |
| Inspector | Lookup (User) | Required |  |

#### Final QA Release

| Field Name | Field Type | Required | Notes |
|------------|------------|----------|-------|
| Batch No | Auto-number (Text) | Required |  |
| Product | Lookup (Product Master) | Required |  |
| Inspection Date | Date | Required |  |
| Quantity | Number (Decimal) | Required |  |
| Quality Status | Enum (Select) | Required | Workflow-driven lifecycle state |
| Release Status | Enum (Select) | Required | Workflow-driven lifecycle state |

#### Lab Report

| Field Name | Field Type | Required | Notes |
|------------|------------|----------|-------|
| Test No | Auto-number (Text) | Required |  |
| Sample | Text | Required |  |
| Test Parameter | Text | Required |  |
| Method | Text | Required |  |
| Specification | Text | Required |  |
| Result | Text/Number | Required |  |
| Unit | Enum (UOM) | Required |  |
| Status | Enum (Select) | Required | Workflow-driven lifecycle state |

#### NCR Report

| Field Name | Field Type | Required | Notes |
|------------|------------|----------|-------|
| NCR No | Auto-number (Text) | Required |  |
| Date | Date | Required |  |
| Issue | Textarea | Required |  |
| Department | Lookup (Department) | Required |  |
| Root Cause | Text | Required |  |
| Correction | Textarea | Required |  |
| Status | Enum (Select) | Required | Workflow-driven lifecycle state |

#### CAPA Report

| Field Name | Field Type | Required | Notes |
|------------|------------|----------|-------|
| CAPA No | Auto-number (Text) | Required |  |
| Problem | Textarea | Required |  |
| Root Cause | Text | Required |  |
| Corrective Action | Text | Required |  |
| Preventive Action | Text | Required |  |
| Owner | Lookup (User) | Required |  |
| Due Date | Date | Required |  |
| Status | Enum (Select) | Required | Workflow-driven lifecycle state |

#### Quality Master

| Field Name | Field Type | Required | Notes |
|------------|------------|----------|-------|
| Product | Lookup (Product Master) | Required |  |
| Quality Parameter | Text | Required |  |
| Specification | Text | Required |  |
| Tolerance | Text/Number | Required |  |
| Testing Frequency | Text/Enum | Required |  |

#### Inspection Plan

| Field Name | Field Type | Required | Notes |
|------------|------------|----------|-------|
| Stage | Enum (Select) | Required |  |
| Inspection Type | Enum (Select) | Required |  |

**QA KPIs:** Complaint Rate ≤0.5%, Product Recall = 0, CAPA Closure 100%, GMP/HACCP Compliance 100%

### 11.6 Stores & Inventory Module — ERP Forms & Field Specifications

**Sources:** `Complete_Factory_ERP_Inventory_System.xlsx`, `STORES & INVENTORY MANAGEMENT MANUAL.docx`

**Inventory flow:** GRN Receive → QC Gate → Stock In → Material Issue → Stock Ledger → Physical Audit → Adjustment

#### Inventory Dashboard

| Field Name | Field Type | Required | Notes |
|------------|------------|----------|-------|
| Target | Number/Percent | Required |  |
| Actual | Number/Percent | Required |  |
| Achievement % | Percent (Calculated) | Optional/Computed | Formula: (Actual/Target) x 100 |

#### Item Master

| Field Name | Field Type | Required | Notes |
|------------|------------|----------|-------|
| Item Code | Text | Required |  |
| Item Name | Lookup (Item Master) | Required |  |
| Category | Enum (Select) | Required |  |
| Unit | Enum (UOM) | Required |  |
| Supplier | Lookup (Vendor Master) | Required |  |
| Min Stock | Number | Required |  |
| Max Stock | Number | Required |  |
| Reorder Level | Number | Required |  |
| Location | Text/Select | Required |  |

#### Purchase Store Link

| Field Name | Field Type | Required | Notes |
|------------|------------|----------|-------|
| PR No | Auto-number (Text) | Required |  |
| PO No | Auto-number (Text) | Required |  |
| Supplier | Lookup (Vendor Master) | Required |  |
| Item | Lookup (Item Master) | Required |  |
| Qty | Number (Decimal) | Required |  |
| GRN No | Auto-number (Text) | Required |  |
| Status | Enum (Select) | Required | Workflow-driven lifecycle state |

#### GRN Receive

| Field Name | Field Type | Required | Notes |
|------------|------------|----------|-------|
| GRN No | Auto-number (Text) | Required |  |
| Date | Date | Required |  |
| Supplier | Lookup (Vendor Master) | Required |  |
| Item | Lookup (Item Master) | Required |  |
| Qty | Number (Decimal) | Required |  |
| Quality Status | Enum (Select) | Required | Workflow-driven lifecycle state |

#### Raw Material Stock

| Field Name | Field Type | Required | Notes |
|------------|------------|----------|-------|
| Date | Date | Required |  |
| Item | Lookup (Item Master) | Required |  |
| Opening | Number | Required |  |
| IN | Text | Required |  |
| Issue | Textarea | Required |  |
| Closing | Number | Required |  |

#### Material Issue Production

| Field Name | Field Type | Required | Notes |
|------------|------------|----------|-------|
| Issue No | Auto-number (Text) | Required |  |
| Date | Date | Required |  |
| Work Order | Lookup (Work Order) | Required |  |
| Material | Lookup (Material Master) | Required |  |
| Required Qty | Number (Decimal) | Required |  |
| Issued Qty | Number (Decimal) | Required |  |
| Balance | Number (Calculated) | Optional/Computed | Auto-calculated from transactions |

#### BOM Master

| Field Name | Field Type | Required | Notes |
|------------|------------|----------|-------|
| Product | Lookup (Product Master) | Required |  |
| Raw Material | Lookup (Material Master) | Required |  |
| Qty Per Unit | Number (Decimal) | Required |  |
| Unit | Enum (UOM) | Required |  |

#### Finished Goods Store

| Field Name | Field Type | Required | Notes |
|------------|------------|----------|-------|
| Date | Date | Required |  |
| Product | Lookup (Product Master) | Required |  |
| Batch No | Auto-number (Text) | Required |  |
| Receive Qty | Number (Decimal) | Required |  |
| Dispatch Qty | Number (Decimal) | Required |  |
| Balance | Number (Calculated) | Optional/Computed | Auto-calculated from transactions |

#### Spare Parts Store

| Field Name | Field Type | Required | Notes |
|------------|------------|----------|-------|
| Machine | Lookup (Asset Master) | Required |  |
| Spare Part | Lookup (Spare Parts Master) | Required |  |
| Stock | Number | Required |  |
| Issue | Textarea | Required |  |
| Balance | Number (Calculated) | Optional/Computed | Auto-calculated from transactions |

**Material coding:** RM- (Raw Material), PM- (Packaging), FG- (Finished Goods), SP- (Spare Parts)

**Stock control:** FIFO, FEFO, ABC/FSN/XYZ Analysis; Reorder when Current Stock ≤ Reorder Level

**Inventory KPIs:** Accuracy >99%, Turnover >12x/year, Inventory Days ≤45

---


## 12. HR Module — Forms, Fields & Workflows

### 12.1 HR Sub-Modules

Recruitment, Manpower Planning, Onboarding, Attendance, Leave, Payroll, Performance, Training, Welfare, Industrial Relations, Administration (Visitor, Security, Housekeeping, Assets, Vehicles).

### 12.2 Employee Master Fields

| Field group | Fields |
|-------------|--------|
| Identity | Employee ID, Name, Citizenship, PAN, Photo |
| Employment | Classification (Permanent/Contract/Temporary/Daily/Intern), Grade (G1–G7), Department, Position, Reporting To, Join Date, Probation end |
| Compensation | Basic, DA, Grade Allowance, Shift/Meal/Transport Allowance |
| Documents | Academic certificates, Appointment letter, Contract, ID card |
| Statutory | SSF enrollment, CIT election, TDS |

### 12.3 Leave Types & Approval Matrix

| Leave type | Approval |
|------------|----------|
| Casual, Sick, Festival, Maternity, Paternity | Per duration matrix |
| 1 day | Supervisor |
| 2–7 days | Manager |
| >7 days | Director |

### 12.4 Shift Definitions

| Shift | Hours |
|-------|-------|
| A | 6 AM – 2 PM |
| B | 2 PM – 10 PM |
| C | 10 PM – 6 AM |

Office: 8 hrs/day, 48 hrs/week.

### 12.5 Payroll Processing Fields

Attendance data → Leave adjustment → OT calculation → Salary components → Approval → Bank transfer.

**Calendar:** Attendance close 25th → Processing 26–29 → Payment last working day.

### 12.6 Performance Rating Scale

| Rating | Meaning |
|--------|---------|
| 5 | Outstanding |
| 4 | Very Good |
| 3 | Good |
| 2 | Needs Improvement |
| 1 | Unsatisfactory |

### 12.7 HR Authority Matrix (RACI)

| Activity | Officer | Manager | Director | CEO |
|----------|---------|---------|----------|-----|
| Recruitment | R | A | I | - |
| Promotion | C | R | A | I |
| Salary Revision | C | R | A | A |
| Termination | C | R | A | A |

### 12.8 HR Master Forms

| Form ID / Name | Purpose |
|----------------|---------|
| Recruitment Requisition | Initiate hiring |
| Interview Evaluation | Score candidates |
| Appointment Letter | Formal offer |
| Confirmation Letter | Post-probation |
| Promotion Form | Role upgrade |
| Transfer Form | Dept/location move |
| Leave Form | Leave request |
| OT Form | Overtime claim |
| Training Request Form | Training need |
| Visitor Pass | Guest entry |
| Asset Issue Form | Asset allocation |
| Employee Grievance Form | Complaint |
| Warning Letter Form | Disciplinary |
| Performance Appraisal Form | Annual review |
| Exit Clearance Form | Separation |
| Security Incident Report | Security events |

### 12.9 HR KPI Dashboard

| KPI | Target |
|-----|--------|
| Turnover Rate | <5% |
| Absenteeism | <3% |
| Training Completion | 100% |
| Recruitment Closure | <30 days |
| Employee Retention | ≥95% |
| Engagement Score | ≥85% |

### 12.10 Gurukul Training Modules

**Common:** Company introduction, Code of Conduct.

**Department-specific:**
- Sales: 4-tier distribution, sample collection
- Finance: IRD billing, TDS, budget approval process
- Production/Lab: QC standards, batch tracking, GRN process

### 12.11 First-Week Onboarding Tasks (7-Day Plan)

| Day | Activity | Supervisor | Outcome |
|-----|----------|------------|---------|
| 1 | Digital onboarding, profile, biometric attendance | HR Manager | App access active |
| 2 | Institutional introduction, reporting line | GM | Org understanding |
| 3 | SOP study, Code of Conduct signature | Branch Officer | Procedure clarity |
| 4 | App dashboard, order management, reporting training | IT Deputy Head | Tech proficiency |
| 5 | Gurukul mandatory courses + exam | Gurukul Coordinator | Certification |
| 6 | Factory/warehouse site visit | Production Manager | Process understanding |
| 7 | Week review, next week KPI setting | GM | Clear action plan |

---

## 13. Finance Module — Forms & Workflows

### 13.1 Chart of Accounts Structure

| Head | Range |
|------|-------|
| Assets | 1000 |
| Liabilities | 2000 |
| Equity | 3000 |
| Revenue | 4000 |
| COGS | 5000 |
| Operating Expenses | 6000 |

Financial year: Shrawan 1 – Ashadh end.

### 13.2 Voucher Types

Journal Voucher, Payment Voucher, Receipt Voucher, Contra Voucher.

### 13.3 CAPEX Approval Matrix

| Amount (NPR) | Approver |
|--------------|----------|
| Up to 500,000 | CFO |
| 500,000 – 5 Million | CEO |
| Above 5 Million | Board |

### 13.4 Credit Control Workflow

Sales Manager → Finance Manager → CFO (credit approval).

### 13.5 VAT Invoice Required Fields

Invoice Number, PAN/VAT Number, Product Details, VAT Amount.

### 13.6 TDS Coverage

Contractor payment, Professional fee, Rent, Commission.

### 13.7 Product Cost Structure Fields

Raw Material Cost + Processing + Packaging + Wastage + Labor + Overhead = Product Cost.

Products: Pickle, Masala, Chhop, Dry Fruits.

### 13.8 Finance Authority Matrix

| Activity | Accountant | Manager | CFO | CEO |
|----------|------------|---------|-----|-----|
| Journal Entry | R | A | I | - |
| Payment Approval | C | R | A | I |
| Budget Approval | C | R | A | A |
| Capital Investment | I | C | R | A |

### 13.9 Finance Master Forms

| Form | Purpose |
|------|---------|
| Payment Voucher | Outgoing payment |
| Receipt Voucher | Incoming payment |
| Journal Voucher | GL adjustment |
| Expense Claim Form | Reimbursement |
| Budget Request Form | Budget line request |
| Asset Registration Form | Fixed asset entry |
| Cash Count Sheet | Petty cash verification |
| Bank Reconciliation Form | Monthly recon |
| Tax Computation Sheet | Tax calculation |
| Audit Observation Form | Audit finding |

### 13.10 Finance KPI Dashboard

| KPI | Target |
|-----|--------|
| Collection Efficiency | >95% |
| Budget Compliance | >95% |
| Inventory Accuracy | >99% |
| Audit Compliance | 100% |
| Receivable Days | ≤30 |
| Inventory Days | ≤45 |
| Payable Days | ≤60 |

---

## 14. Sales & Marketing Module

### 14.1 Sales Hierarchy

CEO → Sales & Marketing Director → National Sales Manager → Regional Sales Manager → Area Sales Manager → Territory Sales Officer → Sales Representative.

### 14.2 Territory Structure (Nepal)

Kathmandu Valley, Purwanchal, Madhesh, Bagmati, Gandaki, Lumbini, Karnali, Sudurpashchim.

### 14.3 Outlet Classification

| Class | Criteria |
|-------|----------|
| A | High volume |
| B | Medium volume |
| C | Standard volume |

Target: 25–30 outlet visits/day/salesperson.

### 14.4 Sales Order Form Fields

| Field | Detail |
|-------|--------|
| Customer/Distributor | FK, credit check |
| Territory/Route | Auto from assignment |
| Product lines | SKU, qty, unit price, discount |
| Scheme/Promotion | Applied offer code |
| Delivery date | Schedule |
| Payment terms | Credit/cash |
| Order total | Tax, discount, net |
| Approval status | Workflow-driven |

### 14.5 Distributor Appointment Workflow

Application → Evaluation (financial capacity, coverage, infrastructure, sales team) → Agreement → Appointment.

### 14.6 Pricing Formula

Cost + Margin + Market Benchmark = Selling Price.

### 14.7 Sales Authority Matrix

| Activity | Officer | ASM | NSM | Director | CEO |
|----------|---------|-----|-----|----------|-----|
| Sales Order | R | A | I | - | - |
| Discount | C | R | A | A | I |
| Distributor Appointment | I | C | R | A | A |
| Export Contract | I | I | C | R | A |

### 14.8 Sales Master Forms

| Form | Purpose |
|------|---------|
| Daily Sales Report | Daily achievement |
| Route Plan Sheet | Visit schedule |
| Outlet Visit Report | Call report |
| New Outlet Registration | New customer |
| Distributor Evaluation Form | Performance review |
| Sales Return Form | Return processing |
| Retail Audit Form | Outlet audit |
| Competitor Monitoring Form | Market intel |
| Collection Report | Payment collection |
| Trade Scheme Approval Form | Promotion approval |
| Complaint Form | Customer issue |
| Product Return Form | Return authorization |
| Promotion Approval Form | Campaign sign-off |
| Market Survey Form | Research data |
| New Product Feedback Form | Launch feedback |
| Competitor Tracking Form | Competition log |

### 14.9 Sales KPI Dashboard

| KPI | Target |
|-----|--------|
| Sales Achievement | >100% |
| Collection Efficiency | >95% |
| Numeric Distribution | >90% |
| Outlet Coverage | >95% |
| Market Share | Growth |
| Customer Satisfaction | ≥90% |
| Complaint Resolution | ≤48 hours |

### 14.10 ERP Sales Module Features

Order booking, Route tracking, Collection tracking, Reporting.

### 14.11 Key Accounts

Bhatbhateni, Salesberry, Big Mart, Modern Trade chains, Institutional buyers.

---

## 15. Logistics Module

### 15.1 Dispatch Workflow

Sales Order → Stock Verification → Route Planning → Vehicle Allocation → Picking → Loading → Documentation → Dispatch.

### 15.2 Delivery Documentation

Invoice, Delivery Note, Gate Pass, POD (Proof of Delivery — customer signature mandatory).

### 15.3 Vehicle Register Fields

Vehicle Number, Capacity, Insurance, Tax, Fitness certificate, Fuel consumption (KM/Litre).

### 15.4 Driver Daily Checklist

Brake, Tyre, Lights, Fuel.

### 15.5 GPS Tracking Features

Vehicle location, Route compliance, Speed monitoring.

### 15.6 Logistics Authority Matrix

| Activity | Officer | Supervisor | Manager | Director |
|----------|---------|------------|---------|----------|
| Dispatch | R | A | I | - |
| Route Approval | C | R | A | I |
| Transport Contract | I | C | R | A |

### 15.7 Logistics Master Forms

| Form | Purpose |
|------|---------|
| Dispatch Sheet | Load manifest |
| Vehicle Checklist | Pre-trip inspection |
| POD Form | Delivery confirmation |
| Fuel Request Form | Fuel requisition |
| Delivery Report | Daily delivery summary |
| Vehicle Inspection Form | Maintenance check |
| Route Plan | Route assignment |
| Accident Report | Incident record |
| Return Goods Form | Return logistics |
| Driver Performance Form | Driver KPI |

### 15.8 Logistics KPI Dashboard

| KPI | Target |
|-----|--------|
| On Time Delivery | >95% |
| Delivery Accuracy | >99% |
| POD Compliance | 100% |
| Fuel Efficiency | Target KM/L |

### 15.9 ERP Logistics Features

Dispatch tracking, Vehicle tracking, POD tracking.

---

## 16. Maintenance & Engineering Module

### 16.1 Equipment Classification

| Category | Type |
|----------|------|
| A | Critical equipment |
| B | Important equipment |
| C | Support equipment |

### 16.2 Equipment Master Fields

Asset Code, Machine Name, Location, Purchase Date, Capacity, Category, Health Index (Green/Yellow/Red).

### 16.3 PM Schedule

| Frequency | Activity |
|-----------|----------|
| Daily | Inspection |
| Weekly | Lubrication |
| Monthly | Calibration check |
| Quarterly | Overhaul |
| Annual | Major maintenance |

### 16.4 Breakdown Response

Critical machine: **15 minutes** response target. MTTR target: **<2 hours**.

### 16.5 Work Permit Types

Hot Work, Electrical Work, Height Work, Confined Space (LOTO required).

### 16.6 OEE Formula

OEE = Availability × Performance × Quality. **Target: ≥85%.**

### 16.7 Calibration Schedule

| Equipment | Frequency |
|-----------|-----------|
| Weighing Scale | Monthly |
| Thermometer | Quarterly |
| Pressure Gauge | Annual |
| pH Meter | Monthly |

### 16.8 Spare Parts Categories

Critical, Essential, Consumable — with min stock and reorder point.

### 16.9 Engineering Authority Matrix

| Activity | Engineer | Manager | Plant Head | CEO |
|----------|----------|---------|------------|-----|
| PM Schedule | R | A | I | - |
| Spare Purchase | C | R | A | I |
| Shutdown Plan | C | R | A | I |
| Capital Project | I | C | R | A |

### 16.10 Maintenance Master Forms

| Form | Purpose |
|------|---------|
| Work Order Form | Maintenance job |
| PM Checklist | Scheduled maintenance |
| Breakdown Report | Failure record |
| Calibration Form | Calibration log |
| Spare Request Form | Parts requisition |
| Shutdown Checklist | Planned shutdown |
| Energy Audit Form | Energy review |
| LOTO Permit | Lockout/tagout |
| Maintenance Logbook | Daily log |
| Engineering Change Request | Change control |

### 16.11 Maintenance KPI Dashboard

| KPI | Target |
|-----|--------|
| PM Compliance | >95% |
| OEE | >85% |
| MTTR | <2 hours |
| Breakdown Rate | <2% |
| Energy Cost | Within budget |

---

## 17. IT & Digital Transformation Module

### 17.1 IT Asset Register Fields

Asset Code, User, Department, Purchase Date, Warranty, Asset Type (Desktop, Laptop, Printer, Server, CCTV, Router).

### 17.2 ERP User Access Workflow

User Request → Approval → Access Creation → Training.

### 17.3 Helpdesk SLA

| Priority | Resolution |
|----------|------------|
| Critical | 2 hours |
| High | 4 hours |
| Medium | 1 day |
| Low | 3 days |

### 17.4 Backup SOP

Data Backup → Verification → Storage → Recovery Test.

**Targets:** Backup success 100%, ERP uptime ≥99.5%.

### 17.5 Information Classification

Public, Internal, Confidential, Highly Confidential.

### 17.6 DMS Document Types

SOP, Policies, Contracts, HR Files.

### 17.7 BI Dashboard Integration

ERP + BI → Management Dashboard covering Production, Sales, Finance, Inventory, HR.

### 17.8 IT Authority Matrix

| Activity | Officer | Manager | CIO | CEO |
|----------|---------|---------|-----|-----|
| User Access | R | A | I | - |
| Server Change | C | R | A | I |
| ERP Upgrade | I | C | R | A |
| Cloud Migration | I | C | R | A |
| Cyber Security Policy | I | C | R | A |

### 17.9 IT Master Forms

| Form | Purpose |
|------|---------|
| User Access Request | New/modify access |
| Asset Issue Form | IT asset allocation |
| Incident Report | IT incident |
| Backup Log | Backup record |
| Server Checklist | Server health check |
| IT Ticket Form | Helpdesk ticket |
| CCTV Access Request | Camera access |
| Password Reset Form | Credential reset |
| Change Request Form | System change |
| Asset Return Form | Asset return |
| Asset Disposal Form | Asset retirement |
| Security Incident Report | Security event |
| ERP Change Approval Form | ERP modification |
| IT Audit Checklist | Audit record |

### 17.10 Smart Factory Features (Roadmap)

Machine → Sensor → ERP → Dashboard; Real-time output, downtime, OEE; Industrial dashboard; CCTV analytics; Digital twin.

### 17.11 Executive Dashboard Types

CEO Dashboard, Plant Dashboard, Finance Dashboard, Sales Dashboard.

---

## 18. R&D Module

### 18.1 R&D Product Pipeline

Idea → Research → Development → Trial (Lab → Pilot → Commercial) → Launch.

### 18.2 Stage-Gate Process

Gate 1 (Idea) → Gate 2 (Feasibility) → Gate 3 (Development) → Gate 4 (Trial) → Gate 5 (Launch).

### 18.3 Product Lines

**Achar:** Timmur, Mango, Mixed. **Masala:** Chicken, Momo, Chat. **Chhop:** Traditional Nepali. **Dry Fruits:** Healthy snack segment.

### 18.4 Trial Report Fields

Trial type, Batch size, Formula version, Sensory scores (taste, aroma, texture, appearance), Stability data, Cost estimate, QA sign-off.

### 18.5 Product Approval Committee

CEO, Plant Head, QA Manager, R&D Manager, Marketing Manager.

### 18.6 R&D Authority Matrix

| Activity | Officer | Manager | Director | CEO |
|----------|---------|---------|----------|-----|
| Trial Approval | R | A | I | - |
| Product Launch | C | R | A | A |
| Formula Change | C | R | A | I |

### 18.7 R&D Master Forms

| Form | Purpose |
|------|---------|
| Idea Submission Form | New product idea |
| Product Concept Sheet | Concept definition |
| Trial Report | Trial results |
| Sensory Evaluation Form | Taste panel scores |
| Product Approval Form | Launch authorization |
| Shelf Life Study Sheet | Stability data |
| Packaging Evaluation Form | Pack testing |
| Formula Change Request | Recipe modification |
| Product Launch Checklist | Go-live checklist |
| Innovation Register | Idea tracking |

### 18.8 R&D KPI Dashboard

| KPI | Target |
|-----|--------|
| New Product Launch | ≥5/year |
| Product Success Rate | >80% |
| Trial Success Rate | >90% |
| Cost Reduction Projects | ≥3/year |

### 18.9 Product Master File Contents

Formula sheet, BOM, Trial reports, Approval reports, Full product history.

---

## 19. CEO & Executive Dashboards

### 19.1 CEO Daily Dashboard (Mandatory Review)

| Area | Metrics |
|------|---------|
| Production | Plan vs actual, OEE, Downtime, Rejection rate |
| Sales | Daily sales, territory sales, distributor performance |
| Finance | Cash position, Receivables, Payables |
| HR | Attendance rate, Accidents, Turnover |
| Quality | Complaints, batch release, GMP status |
| Maintenance | Breakdowns, PM compliance |
| Safety | Lost time accidents |

### 19.2 CEO Master KPI Dashboard

| Category | KPI | Target |
|----------|-----|--------|
| Finance | Revenue Growth | ≥20% |
| Finance | EBITDA | ≥15% |
| Operations | OEE | ≥85% |
| Quality | Product Recall | 0 |
| Sales | Market Share | +5% |
| HR | Employee Retention | ≥95% |
| Safety | Lost Time Injury | 0 |
| Digital | ERP Availability | ≥99.5% |
| Governance | Audit Closure | ≥95% |
| ESG | Energy Reduction | -5% |

### 19.3 CEO Daily Checklist

- ERP Dashboard Review
- Production Report Review
- Sales Dashboard Review
- Cash Position Review
- Customer Complaint Review
- Plant Walkthrough
- Executive Approval Pending List
- Safety Incident Review
- Email & Government Correspondence
- Priority Project Monitoring

### 19.4 Weekly Executive Meeting Agenda

Action review, Sales, Production, Inventory, Quality, Complaints, Finance, HR, Risk, New decisions.

### 19.5 Monthly Business Review Reports

Finance (P&L, Cash Flow, Budget Variance), Sales (Territory, Brand, Distributor), Production (Capacity, OEE, Yield), QA (Complaints, CAPA, GMP), HR (Attendance, Turnover, Training).

### 19.6 Performance Escalation Matrix

| Achievement | Action |
|-------------|--------|
| ≥100% | Recognition |
| 90–99% | Continue monitoring |
| 80–89% | Improvement plan |
| <80% | CEO intervention |

---

## 20. Governance, Risk & Compliance Features

### 20.1 Enterprise Risk Register Categories

Strategic, Operational, Financial, Legal, Cyber.

### 20.2 Risk Review Frequency

| Risk type | Review |
|-----------|--------|
| Strategic | Quarterly |
| Operational | Monthly |
| Financial | Weekly |
| Cyber | Monthly |

### 20.3 Fraud Prevention Controls

Dual approval, ERP workflow, CCTV, surprise audit, vendor due diligence.

### 20.4 Crisis Command Team

| Role | Responsibility |
|------|----------------|
| CEO | Crisis Commander |
| Factory Director | Plant Operations |
| QA Head | Food Safety |
| HR Head | Employee Safety |
| IT Head | System Recovery |
| Finance Head | Financial Continuity |

Crisis types: Food recall, Fire, ERP failure, Pandemic, Labour strike, Natural disaster, Cyber attack.

### 20.5 Compliance Areas

Company Act, Labour Act, Food Act, VAT Act, Income Tax Act, Environmental, SSF, ISO standards.

### 20.6 Board Forms

BOD-FRM-001 (Agenda), BOD-FRM-002 (Resolution), BOD-FRM-003 (Director Declaration), BOD-FRM-004 (Conflict of Interest), BOD-FRM-005 (Annual Calendar), BOD-FRM-006 (Compliance Checklist).

### 20.7 CEO Forms (Selected)

CEO-FRM-001 (Decision Approval) through CEO-FRM-010 (Annual Performance Review), plus volume-specific forms for budget, CAPEX, crisis, board report, KPI dashboard, etc.

---

## 21. Mobile Applications

| App | Features |
|-----|----------|
| Sales App | Order booking, route plan, outlet visit report, collection |
| Attendance App | Biometric/GPS check-in, leave request |
| Logistics App | Dispatch status, POD capture (signature), delivery confirmation, GPS |

All mobile apps consume same Business Services API as web — no direct DB access.

---

## 22. Future / Roadmap Features

| Feature | Phase | Description |
|---------|-------|-------------|
| ERP Optimization | Phase 1 (2026–2030) | Core module stabilization |
| Smart Factory | Phase 2 | IoT, machine connectivity, real-time monitoring |
| AI Enterprise | Phase 3 | ML forecasting, predictive maintenance, demand optimization |
| Industry 4.0 | Phase 4 | Digital twin, blockchain traceability, integrated command center |
| Capability Marketplace | Future | Install capabilities (e.g., AI Forecast) in minutes |
| Digital Twin | Future | Virtual factory simulation and optimization |
| Blockchain Traceability | Future | Raw material → production → distribution → consumer |
| Smart Warehouse | Future | Barcode/RFID real-time stock |
| ESG Digital Reporting | Future | Environment, Social, Governance automated reports |
| Passkey Auth | Future | Passwordless authentication |

---

## 23. Master Forms Register (Cross-Department)

### CEO Office (CEO-FRM-001 – CEO-FRM-087+)

Decision Approval, Executive Meeting Minutes, Strategy Review, Monthly Business Review, Risk Register, CAPEX Approval, Crisis Report, KPI Dashboard, Board Report, Annual Performance Review, Budget Approval, Financial Review, CAPEX Evaluation, Investment Proposal, Daily Operations Review, Production Performance, Quality Review, Supply Chain Review, Leadership Assessment, Succession Matrix, Engagement Survey, Governance Review, Ethics Declaration, Conflict of Interest, and more across 10 volumes.

### HR (HR-FRM / Admin Forms)

Leave, OT, Training Request, Visitor Pass, Asset Issue, Grievance, Warning Letter, Performance Appraisal, Exit Clearance, Security Incident, Recruitment Requisition, Interview Evaluation, Appointment/Confirmation/Promotion/Transfer/Exit forms.

### Finance

Payment/Receipt/Journal Voucher, Expense Claim, Budget Request, Asset Registration, Cash Count, Bank Reconciliation, Tax Computation, Audit Observation.

### Sales & Marketing

Daily Sales Report, Route Plan, Outlet Visit, Distributor Evaluation, Sales Return, Retail Audit, Competitor Monitoring, Collection Report, Trade Scheme Approval, Complaint, Market Survey, New Product Feedback.

### Logistics

Dispatch Sheet, Vehicle Checklist, POD, Fuel Request, Delivery Report, Route Plan, Accident Report, Return Goods, Driver Performance.

### Maintenance

Work Order, PM Checklist, Breakdown Report, Calibration, Spare Request, Shutdown Checklist, Energy Audit, LOTO Permit, Engineering Change Request.

### IT

User Access, Asset Issue/Return/Disposal, Incident Report, Backup Log, Server Checklist, IT Ticket, CCTV Access, Password Reset, Change Request, Security Incident, ERP Change Approval, IT Audit Checklist.

### R&D

Idea Submission, Product Concept, Trial Report, Sensory Evaluation, Product Approval, Shelf Life Study, Packaging Evaluation, Formula Change, Launch Checklist, Innovation Register.

### Quality (from QA manuals — referenced in factory SOP)

Inspection Report, QC Sheet, Release Report, CAPA Form, Audit Checklist.

### Stores (from inventory SOP)

GRN, Stock Issue, Stock Report, Physical Verification Sheet.

---

## Appendix A: Workflow Trigger → Capability Map

| Trigger event | Capabilities activated |
|---------------|------------------------|
| Consumer order | Sales → Inventory → (Production → Purchase) → Logistics → Finance |
| Low stock alert | Inventory → Purchase → Supplier notification |
| Machine breakdown | Maintenance → Production (schedule adjust) → Notification |
| Employee join | HR → IT (access) → Training (Gurukul) → Payroll |
| Leave request | HR → Supervisor approval → Attendance update |
| Customer complaint | CRM → QA investigation → CAPA → Sales follow-up |
| New product idea | R&D → Stage gate → Production pilot → QA → Marketing → CEO approval |
| Invoice due | Finance → Collection workflow → Sales alert |
| GRN received | Stores → QC incoming → Inventory update → Finance (AP) |
| Batch completed | Production → QC process → QC final → Inventory FG |

### A.1 Implemented service entry points (`server/core/services/`)

| Trigger / action | Service function |
|------------------|------------------|
| Checkout | `checkout_service.checkout` → `payment_service.mark_payment_success` |
| Low stock | `stock_service.post_ledger` → reorder / `procurement_service.create_reorder_pr` |
| PR submit/approve | `procurement_service.submit_pr` / `approve_pr` |
| GRN receive/post | `grn_service.receive_grn` / `post_grn` |
| WO release | `process_service.release_work_order` |
| Final QA | `qa_service.final_qa_release` |
| Dispatch / POD | `dispatch_service.mark_dispatched` / `create_pod` |
| Leave approve | `leave_service.approve_leave` |
| Payroll pay | `payroll_service.pay_payroll` |
| Complaint | `crm_service.register_complaint` |
| PM due | `maintenance_service.create_pm_work_orders_due` |
| Approval decide | `workflow_service.decide_approval` |

Full cascade catalog: `models_logic.md`.

---

## Appendix B: Numeric Targets Quick Reference

| Metric | Target |
|--------|--------|
| Revenue Growth | ≥20% |
| Gross Profit Margin | ≥30% |
| Net Profit Margin | ≥12% |
| Production Plan Achievement | ≥98% |
| OEE | ≥85% |
| Production Downtime | ≤3% |
| Product Rejection | ≤1% |
| OTIF | ≥98% |
| Inventory Accuracy | ≥99% |
| Inventory Days | ≤45 |
| Receivable Days | ≤30 |
| Collection Efficiency | ≥95% |
| Customer Satisfaction | ≥90% |
| Employee Retention | ≥95% |
| Training Completion | 100% |
| ERP Uptime | ≥99.5% |
| PM Compliance | ≥95% |
| Audit Findings Closed | ≥95% |
| New Products/Year | ≥5 |
| Major Cyber Incident | 0 |
| Product Recall | 0 |
| Lost Time Accident | 0 |

---

*This document is the implementation companion to `project.md`. Source extractions available in `extracted_content/`.*
