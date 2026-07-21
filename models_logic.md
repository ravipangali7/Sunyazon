# Sunyazon / BEOS — Model Business Logic

**Document purpose:** Domain side-effects and cascades implied by `server/core/models/`, cross-checked with `project.md`, `feature_and_module.md`, `models.md`, and frontend (`web/`).

**Sources**
| Source | Role |
|--------|------|
| `server/core/models/*.py` | Canonical fields, enums, FKs (~171 models) |
| `models.md` §25–26 | Service map + entity relationships |
| `project.md` / `feature_and_module.md` | Workflows, policies, department rules |
| `web/src/lib/dummy-data.ts` + routes | UI-implied statuses (Approve/Reject currently non-functional) |

**Current state:** Domain cascades are implemented in `server/core/services/` (rules below). Models remain schema-thin. Prefer **services** for multi-step cascades; thin **signals** for audit helpers, task notify, and embedding reindex only.

---

## Implementation rule

| Layer | Use for |
|-------|---------|
| **Service methods** | Status transitions + cascades in one atomic transaction (`leave_service.approve()`, `grn_service.post()`, `payment_service.mark_success()`) |
| **Signals** | Cross-cutting only: `AuditLog`, `Notification`, embedding reindex — avoid recursive cascades in signals |
| **Frontend** | Display + call APIs only — never own stock, payment, or approval mutations |

**Generic object lifecycle (platform):** Draft → Validated → Approved → Active → Suspended → Archived → Disposed

---

## 1. Platform / Workflow / Approval

1. On `WorkflowDefinition` published and domain event matches `trigger_event` → create `WorkflowInstance` + seed `Task`s from `steps_json`.
2. On `Task` created with assignee → send `Notification` (type=`task`).
3. On `Approval.decision=approved` (all required levels) → advance parent `Task` / `WorkflowInstance.current_step`; apply domain status change on linked entity.
4. On `Approval.decision=rejected` or `returned` → rewind entity to prior status; notify requester.
5. On amount-bearing approve (PO, payroll, CAPEX) → enforce `Actor.approval_limit` / Policy Engine; else escalate next level.
6. On any audited status change → write immutable `AuditLog` (who/what/when/before/after).
7. On `Rule` / `Policy` match (e.g. stock ≤ reorder) → execute `action_json` (create PR, notify, block dispatch).
8. On SLA breach (`WorkflowDefinition.sla_config`) → escalate + `Notification` (type=`escalation`).

**Frontend mirror:** `web/src/routes/tasks.tsx` — Approve / Return / Reject must call backend; statuses `new` → `assigned` → `accepted` → `in_progress` → `pending_approval` → `completed` → `verified` → `closed`.

---

## 2. Identity & KYC

9. On `KYCDocument.verification_status=approved` → set `User.is_kyc_verified=True` and `verified_at`.
10. On `KYCDocument.verification_status=rejected` → keep user unverified; notify; allow resubmit.
11. On `Address.is_default=True` save → clear other defaults for same user.
12. On consumer `User` create → optional `UserProfile`, empty `Cart`, `OnlinePresence`.

**Frontend:** `web/src/routes/auth-kyc.tsx` — KYC states `pending_approval` / `verified` / `rejected`.

---

## 3. Organization & Setup

13. On `Organization` create + `industry_template_code` → copy `IndustryTemplate` into `ProcessDefinition` + `ProcessStage` + `ProcessStageField`; set `enabled_capabilities`.
14. On capability disable → hide related menus/workflows; do not delete historical transactions.
15. On `BoardDeclaration.status=signed` → set `signed_at`; may gate `Organization.is_verified`.
16. On `Meeting.status=completed` → require/attach `minutes_doc` (`Document`).

---

## 4. Commerce (Consumer Order) & Payment

17. On checkout → create `Order` + `OrderItem`s from `Cart`/`CartItem` → create `PaymentTransaction(status=pending)` → clear cart.
18. On `PaymentTransaction.status=success` and `order` set → `Order.payment_status=paid`; set `order_status=confirmed`; decrement `Product.stock_qty` (or post warehouse `StockLedger` if seller is org-linked).
19. On `PaymentTransaction.status=failed` → `Order.payment_status=failed`.
20. On `PaymentTransaction.status=refunded` → `Order.payment_status=refunded`; restock; may set `order_status=returned`.
21. On `Order.order_status=cancelled` after paid → refund transaction + restock.
22. On seller product listing approved / `Product.status=published` → product visible in commerce feed.
23. On `Product.status=archived` → hide from storefront; keep historical order lines.
24. On `AdCampaign` payment success → link `payment_transaction`; allow `status=active`.
25. On `AdImpression` → increment `AdCampaign.spent`; if `spent >= budget` → pause campaign.
26. On FG batch released + ecommerce link → sync `Product.stock_qty` from warehouse finished stock.

**Statuses (models):**  
`Order.payment_status`: pending → paid / failed / refunded  
`Order.order_status`: placed → confirmed → packed → shipped → delivered / cancelled / returned  
`Product.status`: draft → published → archived

**Frontend:** `commerce.tsx`, `customer.tsx`, `payments.tsx` — display-only today; mutations must be backend.

---

## 5. Procurement (PR → RFQ → PO)

27. On `PurchaseRequisition.status=submitted` → create approval `Task` for department/manager.
28. On PR `approved` → optionally spawn `RFQ`s (min 3 quotes per policy) and/or draft `PurchaseOrder` from `PurchaseRequisitionLine`s.
29. On PR `rejected` → notify requester; no PO.
30. On `PurchaseOrder.status=approved` → set `approved_by`; notify vendor; allow GRN creation.
31. On PO `sent` → lock line rates/qty (except controlled amendment workflow).
32. On all PO lines fully received via GRNs → PO `closed`.
33. On PO `cancelled` → cancel open GRN drafts; no stock impact.

**Statuses:** PR `draft` → `submitted` → `approved`/`rejected` → `closed`  
PO `draft` → `approved` → `sent` → `closed`/`cancelled`

**Frontend:** `procurement.tsx` + sample task “Approve PO”.

---

## 6. Inventory / Stores (GRN → Stock → Issue)

34. On GRN `received` → create `IncomingInspection` per `GRNLine` (if QC capability enabled); hold stock until QC.
35. On IncomingInspection / GRN `qc_status=pass|partial` and GRN `posted` → create `StockLedger` **IN** (`reference_type=grn`) for `accepted_qty`.
36. On GRN `qc_status=fail` → do **not** post stock IN (quarantine / return); optional `NCR` + `DebitNote`.
37. On rejected qty > 0 with partial pass → post only `accepted_qty`; open debit/return for reject.
38. On `MaterialIssue.status=issued` → `StockLedger` **OUT** (`reference_type=material_issue`); link WO / ProcessRun.
39. On `StockAdjustment` approved (`approved_by` set) → `StockLedger` adjust; variance = physical − system.
40. After any ledger write → recompute running `closing_qty` for (item, warehouse).
41. When closing qty ≤ `ItemMaster.reorder_level` → `Notification` + Policy action create `PurchaseRequisition`.
42. On FEFO/FIFO pick (dispatch/issue) → prefer earliest expiry batch (food materials).

**GRN statuses:** draft → received → posted / cancelled  
**QC:** pending → pass / fail / partial  
**Ledger types:** in / out / adjust  
**reference_type:** grn | material_issue | process_run_line | sales_dispatch | damage_expire | manual

**ER chain:** `PURCHASE_ORDER → GRN → STOCK_LEDGER`  
**Frontend:** `inventory.tsx` low-stock filter; `stores.tsx` movement signs — move to backend.

---

## 7. Process Engine / Production

43. On `WorkOrder.status=released` → create `ProcessRun` + `ProcessRunStage` rows from `ProcessDefinition` stages; start bound workflow/tasks.
44. Before starting a stage with `requires_previous_complete=True` → block until prior stage `completed` (unless `allow_parallel`).
45. On stage type requiring QC → block complete until `InProcessQC` / `FinalQARelease` pass.
46. On `ProcessRunLine` commit (warehouse capability):
    - `input` / `consumable` → StockLedger **OUT** from `from_warehouse`
    - `output` / `deliverable` → StockLedger **IN** to `to_warehouse`
    - `wastage` → OUT + optional `DamageExpire`
    - `refine` → apply refine_input / output / loss qtys  
    → set `ProcessRunLine.stock_ledger_id`
47. On BOM `approved` + WO released → auto-create draft `MaterialIssue` from BOM lines × `target_qty` (incl. scrap %).
48. On all stages completed → `ProcessRun.status=completed` → `WorkOrder.status=completed`; set `actual_qty` / `waste_qty`.
49. On WO completed → create/update `ProductionCosting`; on cost post → create `JournalVoucher` (material/labor/overhead) → DayBook / Ledger.
50. On `DamageExpire` approved → StockLedger OUT (`reference_type=damage_expire`).
51. On `WorkingReport` hours posted → feed labor cost and/or payroll OT.
52. On Batch QA hold → `Batch.status=quarantined`; block FG dispatch / ecommerce stock sync.
53. On Batch release complete → `Batch.status=closed` (or leave quarantine).

**WO:** draft → released → in_progress → on_hold → completed / cancelled  
**Run:** pending → in_progress → completed / aborted  
**Stage:** pending → in_progress → completed / skipped / failed  
**BOM:** draft → approved → obsolete

**Frontend process canvas:** `process.tsx` — Raw Intake → QC → Mix → Pack → QA Release → FG Stock (metadata labels, not separate tables).

---

## 8. Quality (QA/QC)

54. On IncomingInspection `pass` → update GRN line accepted qty / GRN `qc_status`; enable GRN post → stock.
55. On IncomingInspection `fail` → GRN `qc_status=fail|partial`; open `NCR`; block stock IN.
56. On InProcessQC `fail` → hold/fail `ProcessRunStage`; optional Batch `quarantined`; open `NCR`.
57. On `FinalQARelease.release_status=released` (quality pass) → allow FG StockLedger IN, Dispatch, ecommerce `Product.stock_qty` sync.
58. On FinalQARelease `held` or `rejected` → block Dispatch (`sales_dispatch`); Batch quarantined.
59. On LabReport fail → gate FinalQARelease.
60. On NCR `open` → optional create `CAPA`; link Complaint when from CRM.
61. On CAPA `closed` → may close linked NCR; notify owner.

**QCStatus:** pass / fail / hold  
**Final release:** held / released / rejected  
**NCR:** open → investigating → corrected → closed  
**CAPA:** open → closed

**Policy (project docs):** No FG dispatch without QA sign-off; complaint ≤48 hrs SLA.

**Frontend:** `quality.tsx` batch release + COA; QC vs spec must be server-side.

---

## 9. Sales & Logistics (B2B)

62. On `SalesOrder` / ASM / Dealer / Retail order approved → credit check vs `Party.credit_limit` and open AR; block if over policy.
63. Before Dispatch create/load → require FinalQARelease `released` for batch/FG (if QC on); verify stock available.
64. On Dispatch `loaded` / `dispatched` → StockLedger **OUT** (`reference_type=sales_dispatch`); advance sales doc status.
65. On `POD` created → `Dispatch.status=delivered`, set `delivered_at`; create/post receivable (`Sales` / AR); notify.
66. On Dispatch `cancelled` after stock OUT → reverse ledger or return flow.
67. On `SalesReceived` → update Ledger / CashBank; recompute AR balance.
68. On `CreditNote` posted → reverse receivable; may restock if return-linked.
69. On `ReturnOrder` posted → stock IN + credit note; optional link ecommerce Order `returned`.
70. On `PromotionScheme.status=active` → apply discounts on eligible orders within period.

**Dispatch:** planned → loaded → dispatched → delivered / cancelled  
**ER chain:** `SALES_ORDER → DISPATCH → POD`

**Frontend:** `sales.tsx`, `logistics.tsx` trip delivered ≈ POD.

---

## 10. Finance & Accounts

71. On `JournalVoucher.status=posted` → validate Σ debit = Σ credit; write `DayBook` + `Ledger` (running balance); update `CashBankAccount.current_balance` when applicable.
72. On voucher cancel (if allowed) → reversing entries; never hard-delete posted books.
73. On `PurchasePayment` create → recompute `Purchase.payment_status` (unpaid / partial / paid from sum vs total); update CashBank.
74. On `SalesReceived` → mirror AR receipt + CashBank IN.
75. On `DebitNote` posted → reduce AP / adjust vendor balance.
76. On `IssueCheque.status=cleared` → bank balance out; on `bounced` → reverse + notify.
77. On period-end job → generate `ProfitLossSnapshot` from COA heads.
78. On ProductionCosting / Purchase / Sales posts → funnel into vouchers (single source of truth).
79. On CAPEX amount thresholds (policy): ≤500K CFO, 500K–5M CEO, >5M Board → set approval chain.

**DocStatus (shared):** draft → approved → posted / cancelled  
**Purchase.payment_status:** unpaid → partial → paid  
**Voucher:** draft → verified → posted

**Frontend:** `finance.tsx` AP overdue / GL tags — posting is backend-only.

---

## 11. HR & Administration

80. On `JobVacancy.status=active` → create/publish `FeedPost` (`post_type=job_vacancy`); set `feed_post_id`.
81. On `JobApplicant` / `SelectionScoring` hired → create `Employee` + `OnboardingProcess` + onboarding tasks; create `OrgUser`/`User` if needed; set Vacancy `fulfilled` when filled.
82. On `LeaveRequest.approval_status=approved` → for each date in `from_date`…`to_date` upsert `Attendance(status=leave)`; set `Employee.status=on_leave` while period active; restore `active` after `to_date`.
83. On Leave `rejected` → no attendance change.
84. On leave duration (policy): 1 day Supervisor; 2–7 Manager; >7 Director — route `Approval` levels.
85. On Attendance OT hours → feed `PayrollLine.ot_amount` when payroll runs.
86. On `PayrollRun.status=processed` → generate `PayrollLine`s from attendance + salary masters.
87. On Payroll `approved` → set `approved_by`.
88. On Payroll `paid` → create payment `JournalVoucher` + CashBank OUT + notify employees.
89. On `TrainingLog` exam_score < 80 → flag incomplete / block role stage assignment (Gurukul rule).
90. On Employee exit → set `status=exited`; revoke OrgUser access; trigger clearance tasks.

**Leave:** pending → approved / rejected  
**Employee:** active / on_leave / suspended / exited  
**Payroll:** draft → processed → approved → paid  
**Attendance:** present / absent / half_day / leave (unique per employee+date)

**Frontend:** `hr.tsx` shows on_leave KPI; leave approve / payroll not wired — backend services required.

---

## 12. CRM

91. On `Complaint` registered → create investigation `Task`; start SLA timer (`sla_hours`, target ≤48h).
92. On Complaint → `investigating` → may create `NCR`; on `capa` stage → link `CAPA`.
93. On Complaint `closed` → set `closed_at`; notify customer.
94. On SLA breach → escalate Notification (Customer Care → Sales Manager → QA → CEO for critical).
95. On `PipelineDeal.status=won` → create `SalesOrder` and/or `WorkOrder` (agency/construction); log `CustomerActivity`.
96. On Deal `lost` → activity log only.

**Complaint:** registered → investigating → capa → closed  
**Pipeline:** lead → … → won / lost

---

## 13. Maintenance & Engineering

97. On `PMSchedule.next_due` reached → auto-create `MaintenanceWorkOrder` (preventive, status=`requested`).
98. On Maintenance WO `closed` → update PM `last_done` / `next_due`; adjust `Equipment.health_index`.
99. On `Calibration` fail → set Equipment health `red`; block ProcessRunStage using that resource; create breakdown WO.
100. On breakdown WO → optional spare `MaterialIssue` → StockLedger OUT.
101. On critical machine breakdown → notify Production (schedule adjust) within SLA (15 min response target).

**Maint WO:** requested → approved → in_progress → closed  
**Health:** green / yellow / red

---

## 14. Social / Media / Docs / Chat / AI (lighter cascades)

102. On `FeedPost` published → set `published_at`; notify subscribers/friends.
103. On `Friendship` accepted → set `accepted_at`.
104. On `Story` past `expires_at` → hide/archive (scheduled job).
105. On `ChatMessage` create → update `ChatThread.last_message_at`.
106. On `CallSession` end → set duration; optional chat `call_log` message.
107. On `Document` / `BlogPost` publish → set `published_at`.
108. On Product / Document / Knowledge save → upsert `EmbeddingIndex` (AI search).
109. On domain KPI events → write `KPISnapshot` / refresh `DashboardWidget` data.

---

## Cross-domain cascade map (priority)

```
PR approved ──► RFQ / draft PO
PO approved ──► allow GRN
GRN received ──► IncomingInspection
QC pass + GRN posted ──► StockLedger IN (grn)
Stock ≤ reorder_level ──► Notification + PurchaseRequisition

WO released ──► ProcessRun + stages (+ Workflow/Tasks)
BOM approved × WO ──► MaterialIssue draft
MaterialIssue issued ──► StockLedger OUT
RunLine input/output ──► StockLedger (+ stock_ledger_id)
InProcessQC fail ──► stage hold / Batch quarantined / NCR
FinalQARelease released ──► FG stock / Dispatch / Product.stock_qty
WO completed ──► ProductionCosting ──► JournalVoucher posted ──► DayBook/Ledger

SalesOrder approved + QA OK + credit OK ──► Dispatch
Dispatch dispatched ──► StockLedger OUT (sales_dispatch)
POD ──► Dispatch delivered + AR

PaymentTransaction success ──► Order paid + confirm + stock
PurchasePayment ──► Purchase.payment_status + CashBank
Leave approved ──► Attendance(leave) + Employee.on_leave
Applicant hired ──► Employee + Onboarding + Vacancy fulfilled
Complaint ──► NCR/CAPA; Deal won ──► WorkOrder/SalesOrder
```

---

## Suggested service modules

| Service | Owns |
|---------|------|
| `workflow_service` | Instance, Task, Approval advance |
| `kyc_service` | KYC verify → user flags |
| `org_setup_service` | Template install, capabilities |
| `checkout_service` / `payment_service` | Cart→Order→Payment→stock |
| `procurement_service` | PR → RFQ → PO |
| `grn_service` / `stock_service` | GRN post, ledger, reorder |
| `process_service` / `work_order_service` | WO release, run lines, costing |
| `qa_service` | Inspections, final release gates |
| `dispatch_service` | Dispatch, POD, sales stock OUT |
| `finance_service` | Voucher post, payments, P&L |
| `leave_service` / `payroll_service` | Leave→attendance, payroll pay |
| `hr_recruitment_service` | Hire → employee + onboarding |
| `crm_service` | Complaint SLA, deal won |
| `maintenance_service` | PM due, calibration fail |

Signals: `audit_signal`, `notification_signal`, `embedding_signal` only.

---

## Frontend → backend ownership

| Currently in `web/` | Must live in services/signals |
|---------------------|-------------------------------|
| Low-stock (`on_hand < reorder_level`) | `stock_service` + Policy/Rule |
| Approve / Reject / Return buttons | `workflow_service` + domain service |
| QC pass/fail vs specs | `qa_service` |
| Batch release progress UI | Real gate: FinalQARelease + COA |
| Stock movement +/− display | `StockLedger` posting |
| Payment success/fail display | Gateway webhook → `payment_service` |
| Process stage graph | Workflow + Process Engine |

---

## Related documents

| File | Role |
|------|------|
| `project.md` | Vision, engines, department rules |
| `feature_and_module.md` | Forms, workflows, KPIs |
| `models.md` | Full model catalog + ER |
| `server/core/models/` | Implemented Django models |
| `web/src/lib/dummy-data.ts` | UI status vocabulary |

---

*Implement cascades in services first; keep models thin. Match BEOS principle: business logic in backend/domain only — no duplicate rules in UI.*
