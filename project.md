# Sunyazon / BEOS — Project Documentation

**Document purpose:** Master project reference synthesized from all Sunyazon source documents (CEO manuals, department SOPs, Corporate Governance manual, BEOS blueprint, organizational specs, and factory ERP spreadsheets).

**Primary company context:** Sunyzon Company Pvt. Ltd. (also referenced as शुन्यजोन / Shunyajon Multipurpose Pvt. Ltd.) — FMCG food manufacturing (achar, masala, chhop, dry fruits, masks). Brands: **Laija**, **Royal**, **Suya**, **Navara**.

**Primary software context:** **BEOS** (Business Enterprise Operating System / Business Ecosystem Operating System) — not a traditional menu-driven ERP, but a **mission-driven, workflow-driven, AI-native, multi-tenant business operating platform**.

---

## 1. Executive Summary

BEOS aims to connect the entire business chain from **Consumer → Retail → Wholesale → Dealer → Sole Distributor → Manufacturer → Raw Material Supplier** on one digital platform with:

- Multi-organization, multi-factory, multi-branch support
- Metadata-driven forms, menus, workflows, and dashboards
- Workflow-first execution (Create → Review → Recommend → Approve → Execute → Verify → Complete → Audit)
- AI as a native intelligence layer (recommendations, forecasts, knowledge search, risk detection)
- API-first architecture with zero direct database access from clients
- Zero Trust security, full audit trail, and policy-based governance

**Golden rule for developers:**

> "Users should never search for work. BEOS must automatically deliver the right work, to the right person, at the right time, with the right information, authority, workflow, and guidance."

**Implementation anchor for Sunyzon:** 11 operational departments, 500+ employees, ISO/HACCP/GMP compliance, Nepal financial/tax law (NFRS, VAT, Income Tax, Labour Act), and phased digital transformation (2026–2030).

---

## 2. Vision, Mission & Product Philosophy

### 2.1 BEOS Vision

Create the world's most intelligent, configurable, AI-powered Business Ecosystem Operating System connecting every organization, employee, supplier, partner, dealer, retailer, consumer, process, asset, document, and business decision into one unified digital platform.

### 2.2 BEOS Mission

Enable any organization type to operate on one configurable platform — from planning through consumer and back — eliminating manual coordination across manufacturing, distribution, wholesale, retail, finance, HR, CRM, warehouse, maintenance, AI, workflow, documents, and analytics.

### 2.3 Product Goal

**Not to build ERP — to run business.**

### 2.4 Philosophy Contrast

| Traditional ERP | BEOS |
|-----------------|------|
| Open software → Find menu → Open screen → Fill form → Save | Business Event → Workflow → Task → Approval → Execution → Verification → Completion → Knowledge |
| Menu-driven | Mission-driven → Task-driven → Workflow-driven → AI-assisted → Knowledge-driven |

### 2.5 Sunyzon CEO Vision

"Sunyzon लाई नेपालको अग्रणी FMCG Food Manufacturing Company बनाउने।"

Leadership pillars: Lead by Example, Customer First, People Development, Continuous Improvement, Data Driven Decisions.

---

## 3. Business Ecosystem Model

### 3.1 Vertical Chain (Two-Way Flow)

```
Consumer ⇄ Retail ⇄ Wholesale ⇄ Dealer ⇄ Sole Distributor ⇄ Manufacturer ⇄ Raw Material Supplier
```

Parallel flows: **Information**, **Financial**, **Inventory**, **Approval**, **Knowledge**, **AI Recommendation**.

### 3.2 BEOS Automatic Task Cascade (Example)

1. Consumer places order
2. BEOS tasks Inventory → if no stock → Production → if low raw material → Purchase → Supplier PO
3. Transport delivery task → QC inspection → Finance billing → CEO dashboard update

All workflow automatic; no user menu hunting.

### 3.3 Supported Industry Scope

Manufacturing, Food Industry, Trading, Distribution, Retail, Wholesale, Franchise, Warehouse, Logistics, Service, Agriculture; future: Healthcare, Education, Hospitality.

### 3.4 Multi-Entity Support

Multi Company, Multi Organization, Multi Factory, Multi Branch, Multi Warehouse, Multi Language, Multi Currency, Multi Tax, Multi Workflow, Multi Approval, Multi Role, Multi Device.

---

## 4. Organizational Structure

### 4.1 Sunyzon — 11 Main Departments (with sub-sections)

| # | Department | Core function | Key sub-sections |
|---|------------|---------------|------------------|
| 1 | Production Factory | Raw → finished goods | PPC/Planning, Manufacturing, Packaging, Safety & Environment |
| 2 | Procurement | Sourcing & purchasing | Sourcing/Vendor Dev, Domestic, International/Import |
| 3 | Stores / Inventory | Stock control | Raw Material Store, Finished Goods, Spare Parts |
| 4 | QA / QC | Quality assurance | Inward, In-process, Final QA, Laboratory |
| 5 | Maintenance | Equipment uptime | Mechanical, Electrical, Preventive, Utilities |
| 6 | Sales & Marketing | Revenue & brand | Marketing/Branding, Sales, CRM, Market Research |
| 7 | Finance & Accounts | Financial control | AP, AR, Costing, Tax/Audit, Payroll |
| 8 | HR & Admin | People & facilities | Recruitment, Training, Employee Relations, Admin/Security/Legal |
| 9 | Logistics | Transport & dispatch | Transportation, Dispatch/Shipping, Supply Chain Coordination |
| 10 | IT & Digital Transformation | Digital backbone | ERP, Infrastructure, BI, Cybersecurity, Industry 4.0 |
| 11 | R&D | Innovation | Product Design, Process Innovation, Testing/Prototyping |

### 4.2 Corporate Reporting Hierarchy

```
Board of Directors
└── CEO
    ├── Factory Director
    ├── Finance Director (CFO)
    ├── HR Director
    ├── Sales Director
    ├── IT Director (CIO)
    └── Department Managers → Supervisors → Employees
```

### 4.3 Board Governance Structure

```
Shareholders → Board of Directors
├── Audit Committee
├── Risk Committee
├── Finance Committee
├── HR & Remuneration Committee
└── ESG Committee
→ CEO → Executive Committee → Department Heads → Employees
```

### 4.4 Shunyajon Organogram (App/HR Database Reference)

Departments under महाप्रबन्धक (GM): Administration & HR, Finance & Accounts, Production & Distribution, Sales & Marketing, Science & Technology (IT/BEOS).

Key positions with reporting lines documented in `Management new.docx` including: महाप्रबन्धक → प्रबन्धक (per dept) → शाखा प्रमुख/अधिकृत → inspectors → skilled workers/helpers/security.

---

## 5. BEOS Architecture Overview

### 5.1 Architectural Shift: Module → Capability

BEOS is **Business Capability–based**, not module-first:

- Companies don't "use HR Module" — they enable **Recruitment**, **Attendance**, **Payroll** capabilities
- Capabilities can be independently enabled/disabled per organization
- Modules are collections of capabilities; development starts from capability, not screen

### 5.2 Core Platform Engines (Shared by All Domains)

| Engine | Responsibility |
|--------|----------------|
| Identity Engine | Users, employees, suppliers, dealers, consumers, AI agents, machines, IoT; login, MFA, sessions |
| Organization Engine | Company, branch, department, team, position, reporting hierarchy |
| Metadata Engine | Forms, fields, menus, validation, reports, dashboards, permissions — no hardcoding |
| Business Object Engine | Product, Customer, Supplier, Invoice, Order, Batch, Asset — lifecycle + API + audit |
| Workflow Engine | All business processes; sequential/parallel/conditional/dynamic; SLA, escalation |
| Rule Engine | Runtime business rules (e.g., stock < minimum → purchase request) |
| Policy Engine | Company decisions (e.g., purchase > NPR 10,00,000 → CEO approval) |
| Mission Engine | Login shows Today's Mission, not empty dashboard |
| Task Engine | Mission → tasks with priority, due date, checklist, evidence, states |
| Approval Engine | Single/multi-level/parallel/delegation/auto-approval/escalation |
| Notification Engine | Email, SMS, push, in-app |
| Knowledge Engine | SOP, manuals, training, FAQ, AI knowledge base |
| Search Engine | Global, AI, knowledge search |
| AI Engine | Recommendation, forecast, OCR, translation, decision support |
| Audit Engine | Immutable who/what/when/where/why/before/after |
| Reporting Engine | Dynamic reports from metadata |
| Integration Engine | Banking, government, payment, IoT, third-party |
| Configuration Engine | Form/Workflow/Role/Menu/Report/Rule builders |

### 5.3 Backend Architecture (8 Layers)

1. **Presentation** — API receive/validate/respond (no business logic)
2. **Application** — orchestration, transaction control
3. **Domain** — business rules, domain objects, domain events (most critical)
4. **Workflow** — execution, task assignment, SLA
5. **Policy** — runtime policy evaluation
6. **AI** — recommendations, predictions, knowledge search
7. **Infrastructure** — DB, email, SMS, storage, cache, queue, search
8. **Monitoring** — logs, metrics, audit, health, tracing

**Patterns:** Clean Architecture, Domain-Driven Design (DDD), Event-Driven, Metadata-Driven, Multi-Tenant, Cloud Native.

**Database:** PostgreSQL primary cluster + read replicas + cache + search index + object storage.

**Database schemas:** `core`, `identity`, `organization`, `workflow`, `sales`, `purchase`, `production`, `inventory`, `finance`, `hr`, `crm`, `maintenance`, `ai`, `notification`, `analytics`, `audit`, `integration`, `document`.

### 5.3.1 Domain logic implementation (Django)

Canonical cascade rules: `models_logic.md` (rules 1–109).

| Layer | Location | Role |
|-------|----------|------|
| **Services** | `server/core/services/` | Status transitions + multi-step cascades in atomic transactions |
| **Signals (thin)** | `server/core/signals/` | Cross-cutting only: task notify, embedding reindex |
| **Models** | `server/core/models/` | Schema + enums — no business methods |
| **Frontend** | `web/` | Display + API calls only — never owns stock/payment/approval mutations |

**Service modules:** `workflow_service`, `kyc_service`, `org_setup_service`, `checkout_service` / `payment_service`, `procurement_service`, `grn_service` / `stock_service`, `process_service` / `work_order_service`, `qa_service`, `dispatch_service`, `finance_service`, `leave_service` / `payroll_service`, `hr_recruitment_service`, `crm_service`, `maintenance_service`, `social_service`.

**Golden rule:** Business logic in backend/domain only — UI never duplicates stock, payment, or approval rules.

### 5.4 Frontend Architecture

**Not dashboard-first — Workspace-first.**

Workspace types: Executive, Employee, Production, Warehouse, HR, Finance, Sales, AI, Consumer, Supplier, Dealer, Retail.

**Login landing ("My Work Center"):** Today's Mission, Pending Tasks, Approvals, Alerts, Meetings, AI Assistant, Notifications, Performance, Goals.

**Engines:** Workspace Engine, Navigation Engine, Form Engine, Workflow UI → Business Services API only.

**Design principles:** Work First, Context First, Role Driven, Capability Driven, AI Assisted, Mobile First, Offline First.

**Supported field types (dynamic):** Text, Number, Date, Currency, Dropdown, Multi-select, Barcode, QR, RFID, GPS, Signature, Image, Video, File Upload, Boolean.

### 5.5 API Architecture

- **API Gateway** as single entry point
- Categories: Core Platform, Business, Workflow, AI, Integration
- Every request includes: Tenant ID, Organization ID, Actor ID, Request ID, Correlation ID, Timestamp, Language, Timezone, API Version
- Lifecycle: Design → Review → Approval → Development → Testing → Release → Monitoring → Version Upgrade → Deprecation
- No direct database access from any client (Web, Mobile, AI, IoT, Third-Party)

### 5.6 Security Architecture

**Principles:** Zero Trust, Least Privilege, Defense in Depth, Secure by Design, Privacy by Design, Default Deny, Continuous Verification, Complete Auditability.

**Authentication:** Username/password, OTP, authenticator, biometric, smart card, SSO, passkey (future).

**Authorization levels:** Role-Based → Attribute-Based (branch/dept/shift) → Policy-Based (time/location rules).

**Data security:** Encryption at rest/transit, row-level security, column encryption for salary/bank/gov ID/API secrets.

---

## 6. Enterprise Meta Model (BEOS Constitution)

Core meta entities all modules must conform to:

`Business Ecosystem → Organization, Actor, Party, Business Capability, Business Service, Business Process, Workflow, Task, Business Object, Event, Policy, Rule, Resource, Asset, Document, Knowledge, Goal, KPI, Risk, Control, Notification, AI Agent`

### 6.1 Actor Types

Human (Consumer, Retail Staff, Dealer Staff, Factory Worker, Manager, CEO), AI Agent, System, Machine/IoT.

Each actor has defined: Authority, Responsibility, Approval limits, Tasks, KPIs, Performance.

### 6.2 Data Architecture

**Layers:** Business → Canonical Data Model → Business Objects → Application Data Services → Operational DB → Event Store → Audit Store → Analytics Warehouse → Backup/Archive.

**Classifications:** Master, Transaction, Reference, Configuration, Knowledge, Analytics.

**Lifecycle:** Draft → Validated → Approved → Active → Suspended → Archived → Disposed.

**Quality dimensions:** Accuracy, Completeness, Consistency, Timeliness, Uniqueness.

**Validation levels:** Field → Business → Cross-Domain → Policy.

**Data ownership examples:**

| Data | Owner | Consumers |
|------|-------|-----------|
| Employee | HR | Payroll, Attendance, Production |
| Product | Product Management | Sales, Production, Warehouse |
| Supplier | Procurement | Finance, Quality |
| Customer | Sales | CRM, Finance |
| Machine | Maintenance | Production |

---

## 7. Domain Catalog & Business Capabilities

### 7.1 BEOS Domains

Manufacturing, Supply Chain, Procurement, Warehouse, Sales, CRM, HR, Finance, Maintenance, Quality, Projects, Administration, Knowledge, AI, Governance.

### 7.2 Capability Catalog (Selected)

**Manufacturing:** BOM Management, Recipe Management, Production Planning, Batch Management, Machine Scheduling, Production Monitoring, QC, Packaging, Dispatch.

**Sales:** Lead Management, Quotation, Order, Invoice, Payment, Customer Follow-up.

**HR:** Recruitment, Attendance, Leave, Payroll, Performance, Training.

**Each capability includes:** Purpose, Owner, Business Rules, Inputs, Outputs, Workflow, KPIs, Documents, AI Recommendation, Related Objects, Permissions, SLA.

**Capability maturity levels:** Manual → Digital → Workflow → AI Assisted → Autonomous.

---

## 8. Sunyzon Operational Governance

### 8.1 CEO Authority Matrix (Selected)

| Decision area | CEO authority |
|---------------|---------------|
| Annual Business Plan | Approve |
| Department Budget | Approve |
| Manager Recruitment | Final Approval |
| Director Recruitment | Recommend to Board |
| New Product Launch | Final Approval |
| Capital Expenditure | Per DOA |
| Strategic Partnership | Recommend to Board |

### 8.2 Delegation of Authority (Board Manual)

| Decision | Management | CEO | Board | Shareholders |
|----------|------------|-----|-------|--------------|
| Daily Operations | ✅ | Oversight | | |
| Department Budget | Recommend | Approve | | |
| Annual Budget | Prepare | Recommend | Approve | |
| Major Capital Investment | Evaluate | Recommend | Approve | |
| CEO Appointment | | | Recommend | Approve* |

### 8.3 CEO KPI Framework (Weighted)

| Category | Weight | Sample KPIs |
|----------|--------|-------------|
| Financial Performance | 30% | Revenue Growth ≥20%, Gross Margin ≥30%, Net Profit ≥12%, EBITDA ≥15% |
| Operations | 25% | Production ≥98%, OEE ≥85%, Downtime ≤3%, Rejection ≤1%, OTIF ≥98% |
| Quality & Food Safety | 15% | Complaints ≤0.5%, Recall = 0, GMP/HACCP 100% |
| Human Resource | 15% | Retention ≥95%, Training 100%, Engagement ≥85%, LTA = 0 |
| Strategic Growth | 15% | ≥5 new products/year, ≥2 new regions, export targets |

### 8.4 CEO Operating Cycle

Daily Review → Weekly Executive Review → Monthly Business Review → Quarterly Strategic Review → Annual Business Review.

### 8.5 ERP Modules (Sunyzon IT Manual)

Finance, Procurement, Inventory, Production, Quality, HR & Payroll, Sales & Distribution, Maintenance.

### 8.6 IT Strategic Roadmap 2026–2030

| Phase | Focus |
|-------|-------|
| Phase 1 | ERP Optimization |
| Phase 2 | Smart Factory |
| Phase 3 | AI Enterprise |
| Phase 4 | Industry 4.0 |

Targets: 100% ERP integration, paperless operations, real-time reporting, AI-based analytics, ERP uptime ≥99.5%.

---

## 9. Compliance & Standards

### 9.1 Corporate & Operational

- ISO 9001:2015, ISO 22000:2018, HACCP, GMP
- Nepal: Companies Act 2063, Labour Act 2074, Food Act, VAT Act, Income Tax Act, NFRS
- SSF (Social Security Fund), CIT, TDS compliance

### 9.2 IT & Security

- ISO 27001 alignment for cyber security
- Information classification: Public, Internal, Confidential, Highly Confidential
- Backup: Daily/Weekly/Monthly; DR for server failure, cyber attack, fire, earthquake
- CCTV retention: minimum 90 days

### 9.3 Regulatory Bodies (Inspection)

DFTQC, Inland Revenue Office, Labour Office, Local Government, Social Security Fund.

---

## 10. Product Portfolio (Sunyzon FMCG)

| Brand | Positioning |
|-------|-------------|
| Laija | Premium Nepali Taste |
| Royal | Quality Spices |
| Suya | Traditional Flavor |
| Navara | Healthy Dry Fruits |

Product categories: Pickle (achar), Masala, Chhop, Dry Fruits, Masks.

Sales channels: Modern Trade (Bhatbhateni, Salesberry, Big Mart), General Trade (Wholesaler, Distributor, Retailer), Institutional (Hotels, Restaurants, Corporate).

Export target countries: India, Bhutan, Bangladesh, UAE, Qatar, Saudi Arabia.

---

## 11. Department Features — Detailed

This section documents every operational department's features as specified in Sunyzon SOP manuals and Excel ERP prototypes. These are the business requirements that BEOS must digitize.

### 11.1 Production Factory (उत्पादन तथा कारखाना)

**Headcount:** ~20 employees | **Data owner:** Factory Director

| Feature | Description |
|---------|-------------|
| Production Planning & Control (PPC) | Sales forecast + order + capacity → approved production plan |
| Material Requirements Planning (MRP) | BOM-driven raw material requirement calculation |
| Work Order Management | WO issuance with batch number, target/actual qty, waste tracking |
| Batch Manufacturing | Batch records with start/end dates, supervisor, status lifecycle |
| BOM Master | Finished product → raw materials with qty per unit and UOM |
| Raw Material Issue | Work-order-linked material issue with store approval |
| WIP Tracking | Opening WIP → input → output → closing WIP per process step |
| Finished Goods Transfer | Produced qty → transfer to FG store with balance tracking |
| Production Costing | Material + labor + machine cost → per-unit cost |
| OEE Dashboard | Availability × Performance × Quality (target ≥85%) |
| Daily Production Report | Plan vs produced vs rejected, downtime, remarks |
| In-Process Quality | Quality parameter checks during manufacturing |
| Packaging Process | Packing, labeling, coding, quantity verification |
| Safety & Environment | PPE compliance, waste management, safety inspections |
| Product-Specific SOPs | Separate manufacturing procedures for Achar, Masala, Chhop, Dry Fruits |

**Batch numbering format:** `SUN-{PRODUCT}-{YEAR}-{SEQ}` (e.g., SUN-ACH-2026-001)

**Key KPIs:** Plan Achievement ≥98%, OEE ≥85%, Downtime ≤3%, Yield ≥98%, Rejection ≤1%

### 11.2 Procurement & Supply Chain (खरिद विभाग)

**Headcount:** ~6 employees | **Data owner:** Procurement Head / Supply Chain Director

| Feature | Description |
|---------|-------------|
| Purchase Requisition (PR) | Department-initiated material requests with budget verification |
| RFQ Management | Minimum 3 quotations per request; payment terms, delivery days |
| Comparative Statement | Weighted evaluation: Price 40%, Quality 30%, Delivery 20%, Service 10% |
| Purchase Order (PO) | Authorized PO with rate, amount, delivery date, terms |
| Goods Receipt Note (GRN) | 3-way matching: PO ↔ GRN ↔ Invoice; accepted/rejected qty split |
| Vendor Master & AVL | Approved Vendor List with quality/delivery ratings and overall score |
| Vendor Registration | Company registration, PAN/VAT, bank details, food license, ISO cert |
| Supplier Evaluation | Monthly scorecard; A (90+), B (80-89), C (70-79), D (<70) rating |
| Supplier Audit | Critical: annual; High-risk: 6-monthly; General: biennial |
| Import Procurement | LC/TT, Incoterms (EXW/FOB/CFR/CIF/DDP), customs clearance |
| Emergency Purchase | Production-stop-risk triggers with post-approval documentation |
| Contract Management | Annual, blanket, rate contracts with SLA and penalty clauses |
| Inventory Reorder Alert | Auto-alert when current stock ≤ reorder level |
| Cost Saving Program | Target 5-10% annual reduction via negotiation, bulk, alternate suppliers |
| SCAR | Supplier Corrective Action Request for quality failures |
| Ethical Procurement | Zero tolerance for bribery, kickback, fake quotations |

**Procurement categories:** Direct (spices, dry fruits), Indirect (stationery, services), Import (specialty spices, packaging film)

**Key KPIs:** On-Time Delivery >95%, Cost Saving ≥5%, Supplier Quality >98%, Purchase Cycle ≤7 days

### 11.3 Stores & Inventory Management (जिन्सी तथा भण्डार)

**Headcount:** ~8 employees | **Data owner:** Store Manager

| Feature | Description |
|---------|-------------|
| Item Master | Code, name, category, UOM, supplier, min/max/reorder levels, bin location |
| GRN Receive | Supplier delivery with quality status gate before stock-in |
| Raw Material Stock Ledger | Opening → IN → Issue → Closing per item per day |
| Material Issue to Production | Work-order-linked issue with required vs issued qty |
| Finished Goods Store | Batch-wise receive and dispatch with balance |
| Spare Parts Store | Machine-linked spare parts stock and issue tracking |
| Purchase-Store Link | PR → PO → GRN chain visibility |
| FIFO / FEFO Control | Expiry-based picking for food materials |
| ABC / FSN / XYZ Analysis | Inventory classification for control priority |
| Physical Stock Audit | System vs physical variance → adjustment workflow |
| Quarantine Management | Hold rejected/suspect material separately |
| Barcode / RFID (Roadmap) | Scan-based receipt, issue, and cycle counting |
| Material Coding | RM- (raw), PM- (packaging), FG- (finished), SP- (spare parts) |

**Key KPIs:** Inventory Accuracy >99%, Turnover >12×/year, Inventory Days ≤45

### 11.4 Quality Assurance & Quality Control (गुणस्तर)

**Headcount:** ~10 employees | **Data owner:** QA Manager

| Feature | Description |
|---------|-------------|
| Incoming Inspection (IQC) | Supplier material check: parameter, result, pass/fail per batch |
| In-Process QC (IPQC) | Process step checks: standard vs actual per parameter |
| Final QA Release | Batch release authorization with quality status and approver |
| Laboratory Testing | Test parameter, method, specification, result, unit, status |
| Quality Master | Product-specific parameters with specification and tolerance |
| Inspection Plan | Stage-wise inspection type, frequency, responsible person |
| NCR (Non-Conformance Report) | Issue → root cause → correction → status tracking |
| CAPA | Corrective + preventive actions with owner, due date, closure |
| HACCP / CCP Monitoring | Critical control point checks per food safety plan |
| Batch Release Control | No FG dispatch without QA sign-off |
| Product Recall Procedure | Traceability from consumer complaint back to raw material batch |
| GMP Compliance Audit | Good Manufacturing Practice checklist and audit readiness |
| Artwork Approval | 100% packaging artwork QA sign-off before procurement |

**Key KPIs:** Complaint Rate ≤0.5%, Product Recall = 0, CAPA Closure 100%, GMP 100%

### 11.5 Maintenance & Engineering (मर्मत सम्भार)

**Headcount:** ~8 employees | **Data owner:** Maintenance Manager

| Feature | Description |
|---------|-------------|
| Preventive Maintenance (PM) | Daily inspect → weekly lube → monthly calibration → quarterly overhaul |
| Breakdown Maintenance | 15-min response for critical machines; MTTR target <2 hours |
| Work Order System | Request → approval → execution → closure with technician assignment |
| Equipment Master | Asset code, location, capacity, category (A/B/C), health index |
| Spare Parts Management | Critical/essential/consumable with min stock and reorder |
| Calibration Schedule | Weighing scale (monthly), pH meter (monthly), thermometer (quarterly) |
| TPM (Total Productive Maintenance) | 8 pillars; autonomous maintenance by operators |
| OEE Tracking | Availability × Performance × Quality per machine |
| Work Permits | Hot work, electrical, height, confined space with LOTO |
| Energy Audit | Utility consumption monitoring and cost control |
| Engineering Change Request | Controlled changes to equipment/process with risk assessment |

**Key KPIs:** PM Compliance >95%, OEE >85%, MTTR <2 hours, Breakdown Rate <2%

### 11.6 Sales & Marketing (बिक्री तथा बजार)

**Headcount:** ~10 employees | **Data owner:** Sales Director

| Feature | Description |
|---------|-------------|
| Territory Management | 8 Nepal regions with ASM/Territory Officer hierarchy |
| Route Planning | 25-30 outlet visits/day; route plan with sequence |
| Sales Order Booking | Customer, products, qty, price, discount, delivery, payment terms |
| Distributor Network | Appointment → evaluation → agreement → performance review |
| 4-Tier Distribution | Manufacturer → Sole Distributor → Dealer → Retailer |
| Modern Trade | Bhatbhateni, Salesberry, Big Mart key account management |
| Institutional Sales | Hotels, restaurants, corporate catering |
| Promotion & Scheme Management | Trade scheme approval with budget and period |
| CRM & Complaints | Register → investigate (≤48 hrs) → CAPA → closure |
| Competitor Tracking | Product, price, distribution, promotion monitoring |
| Market Survey | Field research data collection and analysis |
| Digital Marketing | Facebook, TikTok, YouTube, Instagram campaigns |
| Export Sales | India, Bhutan, Bangladesh, UAE, Qatar, Saudi Arabia |
| Collection Management | Invoice → ledger → collection → reconciliation |
| Pricing Engine | Cost + Margin + Market Benchmark = Selling Price |

**Brands:** Laija (Premium Achar), Royal (Spices), Suya (Chhop), Navara (Dry Fruits)

**Key KPIs:** Sales Achievement >100%, Collection >95%, Outlet Coverage >95%, Complaint Resolution ≤48 hrs

### 11.7 Finance & Accounts (वित्त तथा लेखा)

**Headcount:** ~10 employees | **Data owner:** Finance Director (CFO)

| Feature | Description |
|---------|-------------|
| General Ledger | Journal, payment, receipt, contra vouchers with NFRS compliance |
| Accounts Payable | Supplier invoice → 3-way match → approval → payment |
| Accounts Receivable | Sales invoice → collection → aging analysis |
| Budget Management | Dept budget → finance review → management approval → monitoring |
| Product Costing | RM + processing + packaging + wastage + labor + overhead |
| VAT Management | IRD-compliant invoicing with PAN/VAT, product details, VAT amount |
| TDS Compliance | Contractor, professional fee, rent, commission deductions |
| Treasury & Cash Flow | Daily cash position, inflow/outflow forecast, working capital |
| Fixed Asset Management | Purchase → tagging → depreciation → disposal |
| CAPEX Approval | ≤500K CFO, 500K-5M CEO, >5M Board |
| Bank Reconciliation | Monthly statement vs ledger matching |
| Payroll Integration | Attendance → leave → OT → salary → bank transfer |
| Financial Reporting | P&L, Balance Sheet, Cash Flow per NFRS; monthly management accounts |

**Financial year:** Shrawan 1 – Ashadh end

**Key KPIs:** Collection Efficiency >95%, Budget Compliance >95%, Receivable Days ≤30

### 11.8 HR & Administration (मानव संसाधन)

**Headcount:** ~10 employees | **Data owner:** HR Director

| Feature | Description |
|---------|-------------|
| Manpower Planning | Dept request → HR review → budget → CEO → recruitment |
| Digital Recruitment | Vacancy → auto-screening (edu + experience) → interview → offer → onboarding |
| Employee Master | ID, citizenship, PAN, grade (G1-G7), department, reporting line |
| Biometric Attendance | Shift A/B/C (6-14, 14-22, 22-6) with OT calculation |
| Leave Management | Casual, sick, festival, maternity, paternity with duration-based approval |
| Payroll Processing | Attendance close 25th → process 26-29 → pay last working day |
| Performance Appraisal | 5-point rating scale with goal setting and mid-year review |
| Gurukul Training Platform | Mandatory video courses with 80% minimum exam score |
| 7-Day Onboarding Plan | Digital setup → dept intro → SOP → app training → Gurukul → factory visit → review |
| Welfare & Benefits | SSF, CIT, medical, transport, meal allowances |
| Visitor & Security Management | Pass issuance, incident reporting, CCTV access control |
| Asset & Vehicle Management | Issue/return tracking for company assets |
| Grievance & Disciplinary | Complaint → investigation → resolution → warning letters |
| Exit Management | Resignation → clearance → exit interview → final settlement |

**App database tables:** Position_Master, Job_Vacancies, Job_Applicants, Selection_Scoring, Onboarding_Process, Employee_Onboarding_Tasks, Training_Logs

**Key KPIs:** Retention ≥95%, Turnover <5%, Training 100%, Recruitment Closure <30 days

### 11.9 Logistics & Distribution (ढुवानी)

**Headcount:** ~8 employees | **Data owner:** Logistics Manager

| Feature | Description |
|---------|-------------|
| Dispatch Management | Order → stock check → route → vehicle → picking → loading → dispatch |
| Delivery Documentation | Invoice, delivery note, gate pass, POD (signature mandatory) |
| Vehicle Register | Number, capacity, insurance, tax, fitness, fuel consumption |
| Route Management | Territory-based route planning and optimization |
| GPS Tracking | Vehicle location, route compliance, speed monitoring |
| POD Capture | Digital signature and photo evidence on delivery |
| Return Goods Handling | Return authorization → inspection → stock adjustment |
| Transport Contract Management | Third-party transport agreements and SLA |
| Fuel Management | Request, consumption tracking, KM/litre efficiency |
| Driver Performance | Daily checklist, delivery accuracy, incident records |

**Key KPIs:** On-Time Delivery >95%, Delivery Accuracy >99%, POD Compliance 100%

### 11.10 IT & Digital Transformation (सूचना प्रविधि)

**Headcount:** ~6 employees | **Data owner:** CIO / IT Director

| Feature | Description |
|---------|-------------|
| ERP Administration | User access, module config, master data governance |
| BEOS Development | Business Ecosystem Operating System — core platform build |
| Helpdesk / IT Ticketing | Priority-based SLA: Critical 2hr, High 4hr, Medium 1 day, Low 3 days |
| IT Asset Management | Desktop, laptop, server, CCTV, router lifecycle tracking |
| Backup & Disaster Recovery | Daily backup, verification, recovery test; DR for cyber/fire/earthquake |
| Cyber Security | ISO 27001 alignment, endpoint protection, firewall, annual pen test |
| BI Dashboards | Production, Sales, Finance, Inventory, HR executive dashboards |
| Document Management System | SOP, policies, contracts, HR files with version control |
| Network & Infrastructure | LAN, WiFi, cloud server, Microsoft 365 (Outlook, Teams, SharePoint) |
| Smart Factory (Roadmap) | Machine → sensor → ERP → dashboard; IoT integration |
| Industry 4.0 Roadmap | Phase 1 ERP → Phase 2 Smart Factory → Phase 3 AI → Phase 4 Digital Twin |
| Mobile Apps | Sales App, Attendance App, Logistics App |

**Key KPIs:** ERP Uptime ≥99.5%, Backup Success 100%, Zero major cyber incidents

### 11.11 Research & Development (अनुसन्धान)

**Headcount:** ~4 employees | **Data owner:** R&D Manager

| Feature | Description |
|---------|-------------|
| Idea Management | Idea bank → evaluation → development pipeline |
| Recipe / Formula Development | Ingredient selection → formulation → trial → sensory evaluation |
| Trial Batch Management | Lab → pilot → commercial trial with batch size and formula version |
| Sensory Evaluation | Taste, aroma, texture, appearance scoring |
| Shelf Life Study | Real-time and accelerated stability testing |
| Packaging Development | Material evaluation, label design, regulatory compliance |
| Stage-Gate Process | 5 gates: Idea → Feasibility → Development → Trial → Launch |
| Product Lines | Achar (Timmur, Mango, Mixed), Masala (Chicken, Momo, Chat), Chhop, Dry Fruits |
| BEOS Platform Design | Developer blueprint, architecture specification, metadata model |
| Technology Transfer | R&D → Production → QA validation → commercial launch |
| Innovation Register | Track all ideas, trials, and outcomes |
| Product Master File | Formula, BOM, trial reports, approvals, full history |

**Key KPIs:** ≥5 new products/year, Trial Success >90%, ≥3 cost reduction projects/year

---

## 12. Development Principles & Success Criteria

### 12.1 Ten Product Principles

1. Everything is Configurable
2. Everything is Metadata Driven
3. Everything is Workflow Driven
4. Everything is Permission Based
5. Everything is Auditable
6. Everything is Version Controlled
7. Everything is AI Assisted
8. Everything is Searchable
9. Everything is Reusable
10. Everything is Measurable

### 12.2 Engineering Rules (Non-Negotiable)

- Business logic in backend/domain only (`server/core/services/`)
- No duplicate data; no hard coding; configuration first
- Workflow before development; security by design; API first
- Audit everything; no direct DB access from UI
- No form/workflow/permission logic duplicated per module
- Cascades via services first; thin signals for notify/embed only — see `models_logic.md`

### 12.3 Development Order

Business Need → Business Analysis → Business Rules → Workflow → Business Objects → Database → **Domain Services** → API → UI → Coding → Testing → Deployment

### 12.4 Success Criteria

- Users never search menus for work
- Every task auto-routed to correct user
- Every decision traceable
- Every workflow configurable
- Every module uses same core engines
- Full business chain on one platform
- Status transitions and stock/payment mutations execute only in domain services

---

## 13. Factory ERP Master SOP Matrix (Spreadsheet Reference)

From `Complete_Factory_Management_System_with_SOP.xlsx`:

| Department | Main SOP Process | Control |
|------------|------------------|---------|
| R&D | Product development, trial, formulation, improvement | R&D Approval |
| IT & Digital | ERP, data security, automation | System Control |
| Logistics | Dispatch, transportation, delivery | Delivery Report |
| HR & Admin | Recruitment, attendance, policy | HR Approval |
| Finance & Accounts | Budget, accounting, costing, audit | Financial Control |
| Sales & Marketing | Sales planning, dealer, customer | Sales Report |
| Maintenance | Preventive & breakdown maintenance | Maintenance Log |
| Quality QA/QC | Incoming, process, finished product | Quality Record |
| Stores & Inventory | Stock receiving, issue, control | Stock Ledger |
| Production | Planning, manufacturing, packaging | Production Report |

Management Dashboard metrics: Production Status, Sales Status, Inventory Status, Quality Status, Finance Status.

---

## 14. CEO Manual Scope Summary

The CEO User Manual spans **100 chapters / 10 volumes**:

| Volume | Chapters | Focus |
|--------|----------|-------|
| 1 | 1–10 | CEO Charter, KPI, Daily/Weekly/Monthly ops |
| 2 | 11–20 | Strategic leadership, 5-year plan, Balanced Scorecard |
| 3 | 21–30 | Financial leadership, budget, cash, CAPEX |
| 4 | 31–40 | Operations leadership, production, QA, supply chain |
| 5 | 41–50 | People leadership, OD, succession, culture |
| 6 | 51–60 | ERM, compliance, internal audit, crisis/BCP |
| 7 | 61–70 | Digital transformation, ERP governance, AI |
| 8 | 71–80 | Sales, marketing, customer excellence |
| 9 | 81–90 | Board relations, governance, ESG, ethics |
| 10 | 91–100 | CEO Operating System, DOA, master KPI, crisis command |

Includes 100+ SOPs, 60+ policies, 100+ forms/templates.

---

## 15. Corporate Governance Manual Scope

Board manual covers: Governance foundation, shareholder governance, board charter, committee charters, DOA, AGM/EGM SOP, dividend policy, risk oversight, audit governance, ESG, and board reporting frameworks.

Key forms: BOD-FRM-001 through BOD-FRM-006+ (agenda, resolution, director declaration, conflict of interest, calendar, compliance checklist).

---

## 16. Technology Stack (Specified / Implied)

| Layer | Technology |
|-------|------------|
| Database | PostgreSQL (primary + replicas) |
| Cache | Dedicated cache layer |
| Search | Dedicated search index (not DB queries) |
| Object storage | Files, PDFs, images, CAD, certificates |
| BI | Power BI, ERP dashboards, executive reports |
| Cloud | Cloud server, storage, backup; Microsoft 365 (Outlook, Teams, OneDrive, SharePoint) |
| Mobile apps | Sales App, Attendance App, Logistics App |
| IoT | Machine sensors → ERP → Dashboard |
| Future | Digital Twin, Blockchain traceability, Smart Warehouse (Barcode/RFID) |

---

## 17. Source Document Index

| Path | Content |
|------|---------|
| `CORPORATE GOVERNANCE & BOARD MANUAL.docx` | Board governance, shareholder policy, committees, DOA |
| `Bord/Manual/CEO USER MANUAL.docx` | 100-chapter CEO operating system |
| `Bord/Manual/११ वटा मुख्य विभागहरू.docx` | 11 departments, sub-sections, positions |
| `Bord/Manual/Complete_Factory_Management_System_with_SOP.xlsx` | Master SOP matrix, department KPIs, dashboard |
| `Bord/CEO/Department/HR & ADMINISTRATION/` | HR manual (120 chapters), Nepali dept summary |
| `Bord/CEO/Department/FINANCE & ACCOUNTS/` | Finance SOP (80 chapters), Nepali summary |
| `Bord/CEO/Department/SALES & MARKETING/` | Sales manual (80 chapters), brands, channels |
| `Bord/CEO/Department/LOGISTICS & DISTRIBUTION/` | Logistics manual (40 chapters) |
| `Bord/CEO/Department/MAINTENANCE & ENGINERING/` | Maintenance manual (80 chapters), TPM, OEE |
| `Bord/CEO/Department/IT & DIGITALTRANSFORMATION/` | IT manual (100 chapters), smart factory roadmap |
| `Bord/CEO/Department/R&D (RESEARCH & DEVELOPMENT)/` | R&D manual, BEOS docs, org/HR DB specs |
| `R&D/.../BEOS (Business Enterprise Operating System).docx` | BEOS executive summary (Ch 1–18) |
| `R&D/.../BEOS DEVELOPER PROJECT BLUEPRINT.docx` | Full developer blueprint (Ch 1–18+) |
| `R&D/.../शुन्यजोनको कार्यलय/` | Employee rules, dept duties, agreements, org DB schema |

---

## 18. Glossary

| Term | Definition |
|------|------------|
| BEOS | Business Enterprise/Ecosystem Operating System |
| Capability | Independent business function unit (not a code module) |
| Workspace | Role-specific digital workplace replacing static dashboard |
| Mission | Daily prioritized work surfaced at login |
| DOA | Delegation of Authority |
| OEE | Overall Equipment Effectiveness (target ≥85%) |
| OTIF | On-Time In-Full delivery (target ≥98%) |
| CAPA | Corrective and Preventive Action |
| MDM | Master Data Management |
| SSOT | Single Source of Truth |
| TPM | Total Productive Maintenance |
| NFRS | Nepal Financial Reporting Standards |

---

*Generated from extracted document content in `extracted_content/`. Extraction script: `extract_docs.py`.*
