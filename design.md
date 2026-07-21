# Sunyazon / BEOS — Design System & UI Specification

**Document purpose:** Complete visual and UX design reference for building the BEOS web app (including Lovable/AI-generated UI). Every module, model surface, dashboard, form, table, card, canvas, **portal**, and **role/permission-driven navigation** is specified for **mobile-first native iOS-style webview** and **full enterprise ERP desktop**, with **dark + light themes** on an **orange primary** system.

**Aligned to:** `project.md`, `models.md`, `feature_and_module.md`  
**Platform:** BEOS — Business Ecosystem Operating System  
**Company:** Sunyzon Company Pvt. Ltd. (शुन्यजोन)  
**Brand accents:** Laija · Royal · Suya · Navara

---

## Table of Contents

1. [Design Vision & Product UX Principles](#1-design-vision--product-ux-principles)
2. [Theme System (Dark / Light / Orange)](#2-theme-system-dark--light--orange)
3. [Typography & Iconography](#3-typography--iconography)
4. [Spacing, Radius, Elevation & Motion](#4-spacing-radius-elevation--motion)
5. [Mobile Native Shell (iOS WebView)](#5-mobile-native-shell-ios-webview)
6. [Desktop ERP Shell](#6-desktop-erp-shell)
7. [Core UI Components](#7-core-ui-components)
8. [Form Design System](#8-form-design-system)
9. [Table Design System](#9-table-design-system)
10. [Card Design System](#10-card-design-system)
11. [Canvas & Workspace Layouts](#11-canvas--workspace-layouts)
12. [Module-by-Module UI Spec](#12-module-by-module-ui-spec)
13. [Role Dashboards](#13-role-dashboards)
14. [Status, Priority & Lifecycle Visual Language](#14-status-priority--lifecycle-visual-language)
15. [Consumer Platform Surfaces](#15-consumer-platform-surfaces)
16. [Accessibility, Density & Localization](#16-accessibility-density--localization)
17. [Lovable / Implementation Mapping](#17-lovable--implementation-mapping)
18. [Design Tokens (CSS Variables)](#18-design-tokens-css-variables)
19. [Portal Architecture (All Entry Points)](#19-portal-architecture-all-entry-points)
20. [Roles, Permissions & Adaptive Navigation](#20-roles-permissions--adaptive-navigation)
21. [Role → Menu → Screen → Permission Matrix](#21-role--menu--screen--permission-matrix)
22. [Complete Feature → UI Coverage Register](#22-complete-feature--ui-coverage-register)
23. [Department KPI Dashboard Specs](#23-department-kpi-dashboard-specs)

---

## 1. Design Vision & Product UX Principles

### 1.1 Product character

BEOS is **not a traditional menu ERP**. It is a **mission-driven, workspace-first business OS**. The UI must feel like:

| Context | Feel |
|---------|------|
| **Mobile (primary factory/field)** | Native iOS app in a WebView — large tap targets, bottom nav, sheet modals, safe areas, haptic-like feedback |
| **Desktop (HQ / finance / CEO)** | Dense but calm full ERP — left rail, command palette, multi-pane lists, data grids |
| **Both themes** | Orange is the only brand accent; black/white backgrounds; grey text hierarchy |

### 1.2 Golden UX rule (from project.md)

> Users should never search for work. BEOS must automatically deliver the right work, to the right person, at the right time.

**Design implication:** Login never opens an empty dashboard. It opens **My Work Center** with Today's Mission, Tasks, Approvals, and Alerts.

### 1.3 UX pillars

| Pillar | UI behavior |
|--------|-------------|
| Work First | Mission + task queue dominate every home screen |
| Context First | Selecting Supplier/Customer/Product shows smart context panel |
| Role Driven | Navigation and widgets filtered by role + capabilities |
| Capability Driven | Hidden modules when `enabled_capabilities` excludes them |
| AI Assisted | Persistent AI Copilot entry (not a separate “AI page” only) |
| Mobile First | Design mobile shell first; scale up to desktop ERP |
| Offline First (field) | Sales / Logistics / Attendance must support offline-looking local draft states |

### 1.4 What Lovable must produce

A full ERP + consumer hybrid UI kit covering:

- Auth (consumer, employee, organization)
- My Work Center
- Every enterprise module listed in `models.md`
- Dynamic forms (metadata-driven layout preview)
- Role workspaces / dashboards
- Tables, cards, kanban/canvas, approval sheets
- Dark + Light toggle with orange primary

---

## 2. Theme System (Dark / Light / Orange)

### 2.1 Brand color intent

| Role | Meaning |
|------|---------|
| **Primary Orange** | Actions, focus, brand identity, key CTAs, active tabs, progress |
| **Background** | Black (dark) / White (light) — true surfaces, not muddy grey canvases |
| **Foreground** | White / cool grey hierarchy for text and icons |
| **Secondary surfaces** | Slightly elevated blacks / soft greys for cards and sheets |
| **Semantic** | Green success, red danger, amber warning, blue info — never replace orange as brand |

### 2.2 Core palette

#### Brand (shared)

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-primary` | `#F25C05` | Primary buttons, active nav, key highlights |
| `--color-primary-hover` | `#FF6F1F` | Hover / pressed brighter |
| `--color-primary-pressed` | `#D14C00` | Active press |
| `--color-primary-soft` | `rgba(242, 92, 5, 0.14)` | Soft chips, selected rows, focus rings fill |
| `--color-primary-ring` | `rgba(242, 92, 5, 0.45)` | Focus outline |

Orange must stay **warm and food-brand energetic** (Sunyazon FMCG), not neon-pink or purple-tinted.

#### Dark theme (background = black)

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-app` | `#000000` | App background |
| `--bg-elevated` | `#0A0A0A` | Top bar / bottom bar |
| `--bg-surface` | `#121212` | Cards, list rows, sheets |
| `--bg-surface-2` | `#1A1A1A` | Nested panels, inputs |
| `--bg-surface-3` | `#242424` | Hover rows, segmented controls |
| `--bg-overlay` | `rgba(0,0,0,0.72)` | Modal scrim |
| `--fg-primary` | `#FFFFFF` | Titles, primary labels |
| `--fg-secondary` | `#B3B3B3` | Secondary text |
| `--fg-tertiary` | `#8A8A8A` | Hints, placeholders, meta |
| `--fg-disabled` | `#555555` | Disabled |
| `--border-subtle` | `#2A2A2A` | Dividers |
| `--border-strong` | `#3D3D3D` | Input borders |
| `--separator` | `#1F1F1F` | Hairline lists (iOS style) |

#### Light theme (background = white)

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-app` | `#FFFFFF` | App background |
| `--bg-elevated` | `#FFFFFF` | Bars with shadow/hairline |
| `--bg-surface` | `#F7F7F8` | Cards / grouped sections (iOS grouped) |
| `--bg-surface-2` | `#FFFFFF` | Inputs on grey groups |
| `--bg-surface-3` | `#EEEEF0` | Hover / pressed fill |
| `--bg-overlay` | `rgba(0,0,0,0.40)` | Modal scrim |
| `--fg-primary` | `#111111` | Titles |
| `--fg-secondary` | `#5C5C5C` | Secondary |
| `--fg-tertiary` | `#8E8E93` | Meta (iOS secondary label feel) |
| `--fg-disabled` | `#C7C7CC` | Disabled |
| `--border-subtle` | `#E5E5EA` | Dividers |
| `--border-strong` | `#D1D1D6` | Inputs |
| `--separator` | `#E5E5EA` | Hairlines |

#### Semantic (both themes)

| Token | Dark | Light | Usage |
|-------|------|-------|-------|
| `--success` | `#30D158` | `#34C759` | Pass, released, paid, completed |
| `--warning` | `#FFD60A` | `#FF9F0A` | Hold, pending, low stock |
| `--danger` | `#FF453A` | `#FF3B30` | Fail, rejected, overdue, critical |
| `--info` | `#64D2FF` | `#007AFF` | Info, linked docs (use sparingly; orange remains brand) |

### 2.3 Theme toggle

- Persist preference: `system | light | dark`
- Placement: Profile → Appearance; also quick toggle in Settings
- On iOS webview: respect `prefers-color-scheme` when set to system
- Animated crossfade ≤ 200ms on theme switch (background + surfaces only)

### 2.4 Charts & data viz on themes

- Series 1 (brand): orange `#F25C05`
- Series 2–5: cool greys → muted teal/steel (not purple rainbow)
- Gridlines: `--border-subtle`
- KPI “good” uses success green; “bad” uses danger red; neutral grey

---

## 3. Typography & Iconography

### 3.1 Font stack (expressive, not Inter/Roboto default)

Prefer a **system-native feel** for iOS webview + distinctive display for brand moments:

| Role | Font | Fallback |
|------|------|----------|
| **UI / Body** | `SF Pro Text` (webview) → `-apple-system, BlinkMacSystemFont` | `Segoe UI`, system-ui |
| **Numbers / tabular** | `SF Pro` tabular nums / `Inter Tight` tabular | `ui-monospace` for voucher codes only |
| **Display / Brand moments** | `Sora` or `Outfit` (semi-bold) | Used sparingly on splash / login brand |
| **Nepali (Devanagari)** | `Noto Sans Devanagari` | Mixed EN/NP labels |

**Rules**

- Avoid Inter / Roboto / Arial as the designed brand stack.
- ERP density uses SF Pro Text size steps, not oversized marketing type inside tables.
- Login / splash may use one display wordmark: **BEOS** or **Sunyazon**.

### 3.2 Type scale (mobile base)

| Token | Size | Weight | Use |
|-------|------|--------|-----|
| `display` | 28 / 34 | 700 | Workspace titles |
| `title-1` | 22 | 700 | Screen titles |
| `title-2` | 17 | 600 | Section headers |
| `headline` | 15 | 600 | Card titles |
| `body` | 15 | 400 | Form values, paragraphs |
| `callout` | 14 | 400 | Secondary descriptions |
| `caption-1` | 12 | 400 | Meta timestamps |
| `caption-2` | 11 | 500 | Badges, overlines |
| `tab` | 10 | 500 | Bottom tab labels |

Desktop may scale body to 13–14 for dense grids; never below 12 for interactive labels.

### 3.3 Icons

- Style: **SF Symbols–like** line icons, 1.5–2px stroke, rounded caps
- Active tab / primary action: filled orange variant
- Size: 20–24px in nav; 16–18px inline; 28–32px empty states
- Never emoji as UI icons

---

## 4. Spacing, Radius, Elevation & Motion

### 4.1 Spacing scale (4pt)

`4, 8, 12, 16, 20, 24, 32, 40, 48`

| Context | Padding |
|---------|---------|
| Screen horizontal | 16 |
| Card internal | 16 |
| Form field gap | 12 |
| Section gap | 24 |
| Bottom tab safe clearance | 8 + safe-area-inset-bottom |
| Desktop content max padding | 24–32 |

### 4.2 Radius (iOS-native, not bubbly)

| Token | Value | Use |
|-------|-------|-----|
| `--radius-xs` | 6 | Chips, badges |
| `--radius-sm` | 10 | Inputs, small buttons |
| `--radius-md` | 12 | Cards (mobile grouped) |
| `--radius-lg` | 16 | Sheets, large cards |
| `--radius-xl` | 22 | Floating action panels |
| `--radius-pill` | 999 | Segmented control thumbs only |

**Do not** overuse `rounded-full` pills everywhere. Prefer rounded-rect chips.

### 4.3 Elevation

| Theme | Pattern |
|-------|---------|
| Dark | Prefer **border + luminance** over heavy shadows; subtle `0 8px 24px rgba(0,0,0,0.45)` for sheets |
| Light | Soft `0 1px 2px rgba(0,0,0,0.06)`, `0 8px 24px rgba(0,0,0,0.08)` for modals |

No multi-layer neon glow. No purple glow.

### 4.4 Motion (2–3 intentional motions minimum)

1. **Screen push** — iOS-like horizontal slide 280ms ease
2. **Bottom sheet** — spring rise 320ms
3. **Mission pulse** — subtle orange progress ring on Today's Mission card
4. Optional: list row press scale `0.98` 100ms

Reduce motion when `prefers-reduced-motion: reduce`.

---

## 5. Mobile Native Shell (iOS WebView)

Mobile is the **default design target** for operators, store, sales, logistics, and approvals on the floor.

### 5.1 App frame

```
┌─────────────────────────────┐
│ Status area (safe top)      │
│ Large title / compact title │
│ Search / filter (optional)  │
├─────────────────────────────┤
│                             │
│     Scrollable content      │
│     (grouped lists/cards)   │
│                             │
├─────────────────────────────┤
│ Orange FAB (contextual)     │
├─────────────────────────────┤
│ Tab1  Tab2  Tab3  Tab4 Tab5 │  ← bottom tab bar
└─────────────────────────────┘
```

### 5.2 Bottom tab bars by role (examples)

#### Employee / Operator

| Tab | Label | Destination |
|-----|-------|-------------|
| 1 | Work | My Work Center (missions/tasks) |
| 2 | Process | Process Engine runs / stages |
| 3 | Scan | Barcode / QR / RFID camera |
| 4 | Chat | Chat Centre |
| 5 | Me | Profile, attendance, theme |

#### Sales Rep (ASM / field)

| Tab | Work | Orders | Route | Chat | Me |
|-----|------|--------|-------|------|-----|

#### Logistics Driver

| Tab | Trips | Map | POD | Chat | Me |
|-----|-------|-----|-----|------|-----|

#### CEO / Director (mobile)

| Tab | Mission | KPI | Approvals | Alerts | Me |
|-----|---------|-----|-----------|--------|-----|

Active tab icon + label: **orange**. Inactive: tertiary grey.

### 5.3 Navigation patterns

| Pattern | When |
|---------|------|
| **Large Title** | Root tabs (My Work, Inventory, Sales) |
| **Compact title + back** | Detail / form / edit |
| **Bottom sheet** | Filters, quick create, approve/reject |
| **Full-screen cover** | Auth, camera scan, live POD signature |
| **Segmented control** | Status filters (All / Open / Done) |
| **Search bar** | Lists over ~20 items |

### 5.4 List styles (iOS)

1. **Inset grouped** — rounded sections on `--bg-app`, rows on `--bg-surface`
2. **Plain list** — full-bleed separators for long ERP records
3. **Timeline** — workflow / audit history

Swipe actions:

- Leading: Approve / Complete (orange/green)
- Trailing: Reject / Delete / More (red/grey)

### 5.5 Native feel checklist

- [ ] Safe area insets respected
- [ ] 44×44pt minimum hit targets
- [ ] Pull-to-refresh on work queues
- [ ] Keyboard avoids overlapping inputs
- [ ] Sticky section headers in long forms
- [ ] Destructive actions require confirmation sheet
- [ ] No desktop hover-dependent UI as sole path

---

## 6. Desktop ERP Shell

For HQ roles: Finance, HR Admin, CEO, Procurement clerks, configuration builders.

### 6.1 Layout

```
┌────────┬──────────────────────────────┬──────────────┐
│ Brand  │ Top command bar (search/AI)  │ Org · Theme  │
│ Rail   ├──────────────────────────────┼──────────────┤
│        │ Page title · breadcrumbs     │ Context pane │
│ Nav    ├──────────────────────────────┤ (smart form) │
│ by     │                              │              │
│ capa-  │  Main canvas (table/form)    │              │
│ bility │                              │              │
│        │                              │              │
└────────┴──────────────────────────────┴──────────────┘
```

### 6.2 Left rail

- Width: collapsed 72 / expanded 240
- Sections: **My Work**, then capability groups (Finance, Process, Inventory…)
- Active item: orange soft fill + orange left edge 3px
- Capability flags from `organization.enabled_capabilities` hide unused groups

### 6.3 Top bar

- Global search (text / voice / image entry points)
- AI Copilot button (orange outline)
- Notifications bell with unread badge
- Theme switch
- Org switcher (multi-org)

### 6.4 Desktop density modes

| Mode | Row height | Use |
|------|------------|-----|
| Comfortable | 48 | Managers |
| Compact | 36 | Finance clerks, store |
| Spacious | 56 | Touch kiosk / tablet landscape |

---

## 7. Core UI Components

### 7.1 Buttons

| Variant | Look | Use |
|---------|------|-----|
| **Primary** | Solid orange, white label | Create, Submit, Approve, Save |
| **Secondary** | Surface fill, primary text | Cancel alternate |
| **Ghost** | No fill, orange/grey text | Tertiary |
| **Destructive** | Solid danger | Reject, Delete, Void |
| **Icon** | 40–44 circle surface | Scan, more, filter |

Mobile primary buttons are **full-width** at bottom of forms inside a sticky action bar.

### 7.2 Inputs

- Height mobile: 48; desktop: 40
- Label above field (not floating required)
- Helper / error below in caption
- Focus: orange ring 2px + soft orange fill
- Disabled: reduced opacity, no interaction
- Prefix/suffix: NPR, %, kg, barcode icon

### 7.3 Selection controls

- Checkbox / radio: orange when selected
- Switch: orange track when on (iOS-like)
- Segmented control: surface background, selected thumb slightly elevated
- Chips: subtle border; selected = orange soft + orange text

### 7.4 Badges & tags

| Kind | Style |
|------|-------|
| Status | Soft tint background + solid text |
| Priority | Dot + label (critical = red, high = orange) |
| Count | Pill on tabs (numeric) |

### 7.5 Empty / loading / error

- Empty: one illustration (monochrome + orange accent), one sentence, one CTA
- Loading: skeleton blocks matching card/table shape; orange progress indeterminate sparingly
- Error: danger text + Retry primary

### 7.6 Toast / banner / alert

- Toast: bottom on mobile, top-right on desktop; auto-dismiss 3–5s
- Banner: inline under title for SLA breaches
- Alert dialog: iOS action sheet on mobile; centered dialog on desktop

### 7.7 AI Copilot entry

- Persistent floating button (bottom-right above tab bar) — orange
- Opens side sheet: Explain · Suggest · Find SOP · Summarize
- Never blocks primary work; dismissible

---

## 8. Form Design System

Forms are **metadata-driven** (`core.metadata_form`) — UI must render from field schema, not hardcoded per module.

### 8.1 Form screen anatomy (mobile)

```
[ Compact title · Auto-save draft ]
[ Progress steps if multi-step workflow ]
[ Grouped sections ]
  Section A title
  Field…
  Field…
[ Sticky bottom: Save draft | Submit (orange) ]
```

### 8.2 Field types → UI mapping

| Field type (`models` / platform) | Control |
|----------------------------------|---------|
| Text | Single-line input |
| Number | Numeric keypad input |
| Currency | NPR-prefixed amount |
| Date / DateTime | Native picker sheet |
| Dropdown | Searchable bottom sheet / combobox |
| Multi-select | Multi-chip sheet |
| Boolean | Switch |
| File / Image / Video | Upload tiles with preview |
| Barcode / QR / RFID | Scan button opens camera |
| GPS | Map pin capture button |
| Signature | Signature pad full-screen |
| Rich text | Compact editor |
| Line items | Editable mini-table / add-row cards |

### 8.3 Smart context panel

When user selects related master (Supplier, Customer, Product):

| Selection | Auto-show |
|-----------|-----------|
| Supplier | Last price, outstanding, quality rating, AI note |
| Customer | Credit limit, outstanding, order history |
| Product | Stock, batch, expiry, FEFO hint |

Mobile: expandable context card under field. Desktop: right context pane.

### 8.4 Validation display

1. Field-level: red caption under control
2. Business: banner at section top
3. Policy block: full sheet “Blocked by policy” with explanation + escalate

### 8.5 Multi-row line editors (PO, SO, GRN, Journal, BOM, Process lines)

**Mobile:** each line is a **card**; tap to expand fields; swipe to delete  
**Desktop:** spreadsheet-like grid with add row

### 8.6 Master forms register (UI coverage required)

Every form in `feature_and_module.md` §23 must be representable by this engine. Key families:

| Family | Example screens |
|--------|-----------------|
| Procurement | PR, RFQ, CS, PO, GRN, Vendor |
| Production / Process | Work Order, Stage entry, BOM, Batch, Working Report |
| QA | Incoming, IPQC, Final Release, Lab, NCR, CAPA |
| Inventory | Item Master, Material Issue, Stock Adjustment |
| Finance | Journal, Payment, Receipt, Day Book, Cheque |
| HR | Vacancy, Applicant, Leave, Attendance, Payroll |
| Sales | SO, Route Visit, Return, Scheme |
| Logistics | Dispatch, POD, Fuel, Vehicle |
| Maintenance | WO, PM Checklist, Calibration |
| R&D | Trial Report, Sensory, Stage-Gate |
| Governance | Board / CEO forms |

### 8.7 Approval action strip

On any record in `pending_approval`:

- Sticky bar: **Reject** · **Return** · **Approve** (orange)
- Optional remarks required on reject/return
- Show DOA level + policy snippet

---

## 9. Table Design System

### 9.1 Mobile tables → “list cards”

Never force tiny multi-column HTML tables on phones.

Convert to:

```
[Title primary]          [Status badge]
[Secondary meta grey]
[Key metric orange or strong]
[Trailing chevron]
```

Optional: horizontal scroll table only for finance daybook if user requests “grid view”.

### 9.2 Desktop data grid

| Feature | Spec |
|---------|------|
| Sticky header | Yes |
| Sticky first column (entity no.) | Yes |
| Column resize / reorder | Yes (save per user) |
| Row selection | Checkbox + bulk actions bar |
| Sort / filter | Column menus |
| Inline edit | Only for draft states |
| Pagination / infinite | Cursor infinite preferred for mobile; page size 25/50/100 desktop |
| Export | CSV / Excel / PDF via action menu |

### 9.3 Density & zebra

- Prefer subtle separator lines over zebra
- Selected row: `--color-primary-soft`
- Hover (desktop): `--bg-surface-3`

### 9.4 Column patterns by domain

| Domain | Default columns |
|--------|-----------------|
| Tasks | Priority · Title · Due · Status · Assignee |
| PO | PO No · Supplier · Date · Total · Status |
| Work Order | WO No · Process · Target/Actual · Stage · Status |
| Stock | Item · Warehouse · On hand · Reorder · Status |
| Voucher | Voucher No · Type · Date · Debit · Credit · Status |
| Attendance | Employee · Shift · In · Out · OT · Status |
| Dispatch | Dispatch · Route · Vehicle · Status · ETA |

---

## 10. Card Design System

### 10.1 Card philosophy

Cards are **interaction or summary containers**, not decorative boxes wrapping everything.

| Allowed | Not allowed |
|---------|-------------|
| KPI summary, Mission, Task, Order preview | Nesting cards inside cards inside cards |
| Process stage tile on canvas | Hero collage of floating media cards |
| Approval request snippet | Unnecessary borders on every text block |

### 10.2 Card types

#### A. Mission card (hero of Work Center)

- Background: elevated surface
- Left accent bar: orange
- Title: Today's Mission
- Progress ring orange
- CTA: Open tasks

#### B. KPI card

- Label (caption grey)
- Value (title large)
- Delta chip (green/red)
- Sparkline optional

#### C. Task / Approval card

- Priority dot
- Title + due relative time
- Checklist progress
- Swipe actions

#### D. Entity summary card

- Code + name
- 2–3 key fields
- Status badge
- Quick actions menu

#### E. Stage card (Process Engine canvas)

- Stage name from `process_stage.name`
- Qty goal vs actual
- Assignee avatar
- Status color edge

#### F. Alert card

- Warning/danger soft fill
- Short message + Go action

### 10.3 Card chrome

- Dark: `#121212` fill, `#2A2A2A` border
- Light: white/#F7F7F8 fill, hairline border
- Radius: 12–16
- Padding: 16

---

## 11. Canvas & Workspace Layouts

“Canvas” = non-form, spatial or widget-composed working surface.

### 11.1 My Work Center canvas

Widgets (ordered):

1. Today's Mission
2. Pending Tasks
3. Approvals
4. Alerts
5. Meetings
6. Performance / Goals
7. AI Assistant shortcut
8. Notifications preview

### 11.2 Process Engine canvas

Visual pipeline of stages for a `process_run`:

```
[Stage 1] → [Stage 2] → [Stage 3] → [Release]
   ● done      ● active     ○ pending
```

- Mobile: horizontal snap carousel of stage cards + detail below
- Desktop: swimlane / board
- Tap stage → stage form (`process_stage_field` + `custom_data_json`)
- Lines editor for input/output/wastage (`process_run_line`)

Industry templates only change **labels** (Mixing, Packaging, Development…) — same canvas.

### 11.3 CRM pipeline canvas

Kanban columns: Lead → Qualified → Proposal → Negotiation → Won / Lost  
Cards = `crm.pipeline_deal`

### 11.4 Executive KPI canvas

Widget grid from `analytics.dashboard_widget`  
Drag-reorder on desktop; fixed priority stack on mobile.

### 11.5 Logistics map canvas

Map background + stop list sheet; vehicle marker; POD capture entry.

### 11.6 Document / report canvas

Preview pane + metadata side; version chip; watermark rules for confidential.

### 11.7 Configuration builders canvas (admin)

Form / Workflow / Role / Menu / Report / Rule builders — split preview + JSON/schema inspector. Prefer visual preview pane with orange “Published” state.

---

## 12. Module-by-Module UI Spec

Each module below lists: **primary models**, **key screens**, **mobile pattern**, **desktop pattern**, **signature components**.

### 12.1 Core Platform

**Models:** `tenant`, `actor`, `business_object`, `metadata_form`, `workflow_*`, `task`, `approval`, `policy`, `rule`, `audit_log`, `notification`

| Screen | Design |
|--------|--------|
| My Work | Mission canvas |
| Task detail | Checklist + evidence upload + status stepper |
| Approval inbox | List + action sheet |
| Audit trail | Timeline (immutable) |
| Notification center | Grouped by type with unread orange dots |
| Metadata Form Builder | Desktop-first split canvas |

### 12.2 Auth & Identity

**Models:** `user`, `user_profile`, `kyc_document`, `address`, `session`, geo masters

| Screen | Design |
|--------|--------|
| Splash / Login | Black or white full bleed; orange CTA; brand wordmark large |
| MFA / OTP | iOS large digit fields |
| KYC upload | Dual document tiles + status |
| Profile | Avatar, cover, bio; settings grouped lists |
| Session devices | List with revoke |

Account types visuals: Consumer vs Organization vs Employee — same shell, different post-login workspace.

### 12.3 Organization

**Models:** `organization`, `org_user`, `role`, `department`, `branch`, `team`, `board_declaration`, `meeting*`

| Screen | Design |
|--------|--------|
| Org setup wizard | Steps: Profile → Industry template → Capabilities → Admins |
| Capability toggles | Switch list (`process_engine`, `bom`, `batch`, `warehouse`, `qc`) |
| Org chart | Tree canvas (desktop), accordion (mobile) |
| Meetings | Calendar list + attendee chips |
| Board declaration | Document upload + signed badge |

### 12.4 HR & Administration

**Models:** `position_master`, `employee`, `job_vacancy`, `job_applicant`, `selection_scoring`, onboarding*, `training_log`, `attendance`, `leave_request`, `payroll_*`

| Screen | Design |
|--------|--------|
| Employee directory | Avatar list + filters grade/dept |
| Vacancy board | Cards with status; publish to feed flag |
| Applicant pipeline | Stage segmented + scoring sheet |
| Attendance | Day calendar + shift chips A/B/C |
| Leave request | Form + approval strip |
| Payroll run | Desktop grid heavy; mobile summary only |
| Gurukul training | Course cards + progress + exam score ≥80 gate |
| Onboarding 7-day | Checklist timeline |

**Mobile special:** Attendance App feel — big Check-in orange button + GPS meta.

### 12.5 Finance & Accounts

**Models:** COA, vouchers, purchase/sales docs, payments, notes, cash/bank, daybook, ledger, P&L, tax, action_plan, issue_cheque

| Screen | Design |
|--------|--------|
| Chart of Accounts | Tree table |
| Journal entry | Split debit/credit lines; balance indicator |
| Payment / Receipt / Contra | Type selector + party + mode chips |
| Day Book | Date-scoped grid |
| Ledger | Party search + running balance |
| Income / Expense | Type toggle + category chips |
| Cash / Bank accounts | Balance hero cards + transfer action |
| Issue Cheque | Cheque form + cleared/bounced badges |
| P&L snapshot | KPI cards + statement list |
| CAPEX request | Amount routes visual DOA meter |
| Tax & audit (VAT/TDS/Income) | Period filing status badges |
| Budget monitoring | Dept bars vs approved |
| Action Plan | Objective + task checklist |

Visual money emphasis: amounts right-aligned tabular; orange only for primary actions, not for every NPR figure.

### 12.5b Procurement (standalone module UI)

**Models:** `purchase.purchase_requisition*`, `rfq`, `vendor`, `finance.purchase_order*`, GRN linkage

| Screen | Design |
|--------|--------|
| PR list / form | Dept + line items; budget validation banner |
| RFQ board | Min 3 quotes visual comparison |
| Comparative Statement | Side-by-side price/quality/delivery/service scores (40/30/20/10) |
| PO detail | Terms + DOA approval strip |
| Vendor master / AVL | Score A–D badges; audit schedule |
| Supplier registration | Doc upload tiles (PAN/VAT, license, ISO) |
| SCAR | Quality failure linked NCR-style |
| Import / LC tracking | Timeline (Incoterms, customs) |
| Reorder alerts | Low-stock → one-tap Create PR |
| Procurement KPI | OTD, cost saving, cycle days |

### 12.6 Process Engine & Production

**Models:** `industry_template`, `process_definition`, `process_stage`, `process_stage_field`, `work_order`, `process_run*`, `bom*`, `batch`, `working_report`, `damage_expire`, `register_book`, `wip_tracking`, `production_costing`

| Screen | Design |
|--------|--------|
| Process Designer | Stage list editor + field builder |
| Work Order list/detail | Status + qty hero + linked batch/BOM |
| Run canvas | Stage pipeline (see §11.2) |
| Stage entry | Dynamic fields from metadata |
| BOM / Batch | Versioned documents look |
| Raw material issue link | WO + store approval gate |
| Daily production report | Plan vs produced vs rejected |
| Working report | Hours + activities JSON list |
| Register book | Qty movement ledger look |
| OEE / WIP | Gauge + trend |
| Production costing | Cost breakdown → journal link |
| Damage/Expire | Warning styled form |

Factory users still see labels “Mixing / Packaging” — design must not invent separate visual systems per industry.

### 12.7 Store & Inventory

**Models:** `warehouse`, `item_master`, `stock_ledger`, `grn*`, `material_issue*`, `stock_adjustment`

| Screen | Design |
|--------|--------|
| Stock overview | KPI + low-stock alert list |
| Item master | Detail with min/max/reorder meters; RM-/PM-/FG-/SP- code chips |
| Warehouse list | Type chips: raw / finished / spare / packaging |
| GRN | PO linkage timeline + QC gate banner |
| Material issue | WO-linked scan-first mobile flow |
| FG / Spare stores | Batch-wise / machine-linked views |
| Ledger | Movement timeline |
| Physical audit | Variance highlight red/green |
| Quarantine bin | Hold materials separate list |
| ABC / FSN / XYZ | Classification tags on items |

**Scan-first mobile:** large Scan CTA; success haptic toast.

### 12.8 Quality (QA/QC)

**Models:** incoming, IPQC, final_qa, lab, ncr, capa, quality_master

| Screen | Design |
|--------|--------|
| QC inbox | Pending inspections priority |
| Inspection form | Parameter rows pass/fail large taps |
| Inspection plan | Stage × type matrix |
| Batch release | Big Released/Held/Rejected actions |
| NCR → CAPA | Linked document trail |
| Lab report | Spec vs result comparison |
| HACCP / CCP log | CCP checklist cards |
| Artwork approval | Image compare + sign-off |
| Recall procedure | Traceability chain UI |

Pass = green, Fail = red, Hold = amber — never orange for fail.

### 12.9 Sales, Logistics & Distribution

**Models:** `party`, `territory`, ASM/DSM/RSM orders, returns, schemes, `vehicle`, `route`, `dispatch`, `pod`

| Screen | Design |
|--------|--------|
| Territory map | 8 Nepal regions chips |
| Party / outlet | Credit meter + class A/B/C + visit history |
| ASM order | Field-first product/qty/price |
| DSM / Dealer SO | Dealer lines + discount |
| RSM / Retail SO | Retail lines + barcode |
| Order booking | Product search + cart-like lines |
| Promotion / Scheme | Budget + period banner |
| Route plan | Ordered stop list + map (25–30 outlets) |
| Collection | Invoice → receive → reconcile |
| Dispatch board | Status columns |
| Vehicle register | Insurance/fitness expiry warnings |
| Fuel management | KM/L efficiency |
| POD capture | Signature + photo full-screen mandatory |
| Return goods | RMA + inspection gate |

### 12.10 CRM

**Models:** `complaint`, `pipeline_deal`, `customer_activity`

| Screen | Design |
|--------|--------|
| Complaint SLA clock | ≤48h countdown; escalation matrix banner |
| Pipeline kanban | Canvas §11.3 |
| Activity timeline | Call/visit/email icons |
| Competitor tracking | Simple log cards |
| Market survey | Field form + GPS |

### 12.11 Maintenance

**Models:** `equipment`, maintenance `work_order`, `pm_schedule`, `calibration`

| Screen | Design |
|--------|--------|
| Equipment health | Green/Yellow/Red index; A/B/C category |
| PM calendar | Frequency chips daily→annual |
| Breakdown WO | Critical timer (15 min response); MTTR |
| Work permits | Hot/electrical/height/confined + LOTO |
| Spare parts | Critical/essential/consumable |
| Calibration | Due calendar |
| Energy audit | Utility cost cards |
| ECR | Change risk form |
| OEE per machine | Gauge card |

### 12.12 Analytics

**Models:** `dashboard_widget`, `kpi_snapshot`, `report_definition`

| Screen | Design |
|--------|--------|
| Widget library | Drag to workspace (desktop) |
| Report builder | Field picker + preview |
| KPI snapshots | Achievement % with orange progress when on-track |
| Scheduled reports | Delivery channel chips |

### 12.13 IT Helpdesk / Documents / R&D (enterprise)

| Area | Screens / UI notes |
|------|---------------------|
| IT tickets | Priority SLA (2h/4h/1d/3d); chat-linked thread |
| IT assets | Lifecycle list (desktop/laptop/server/CCTV) |
| Backup / DR | Status green checklist |
| User access request | Workflow form |
| Documents | Type icons (word/excel/ppt/mou); version chip; watermark |
| Document templates | System vs org templates |
| Blog / news | Editor + cover |
| R&D idea bank | Pipeline cards |
| Stage-gate (5) | Stepper Idea→Launch |
| Trial / sensory | Score sliders taste/aroma/texture/appearance |
| Shelf life study | Stability chart |
| Product master file | Formula + BOM + history tabs |

### 12.14 Platform Channels & Search / AI

**Models:** `platform_channel`, subscriptions, `search_query_log`, `image_match`, `voice_transcript`, `embedding_index`

| Screen | Design |
|--------|--------|
| Channel directory | Category grid (social, media, gaming, business…) |
| Global search | Tabs: Text · Voice · Image · Scan |
| Image match results | Similarity score cards → product/entity |
| Voice search | Waveform + transcript confirmation |
| AI Copilot panel | Contextual actions (§7.7) |
| Embedding admin | Index health (admin only) |

### 12.15 Ecommerce, Payments & Advertisement

**Models:** commerce.*, `payment_gateway`, `payment_transaction`, `ad_plan`, `ad_campaign`, `ad_impression`

| Screen | Design |
|--------|--------|
| Category browse | Hierarchical chips + grid |
| Product PDP | Gallery (max 6), NPR price, sticky Buy |
| Cart / checkout | Address + gateway select (eSewa/Khalti/bank) |
| Order tracking | Status stepper placed→delivered |
| Seller product editor | Multi-photo + attributes + plan type |
| Pick & drop | Map addresses + status |
| Nearest shop | Map + list |
| Payment txn log | Status badges |
| Ad plans | Pricing cards |
| Ad campaign | Audience + budget + spend meter |
| Live market session | Live badge + product picker |

### 12.16 Chat, Media, Feed & Social extras

**Models:** chat_*, call_session, help_ticket, feed_*, media_*, friendship, story, thought_portal, live_*

| Screen | Design |
|--------|--------|
| Chat threads | Thread type chips (personal/store/product/org/help) |
| Messages | Bubbles; outbound soft-orange |
| Voice/video call | Full-screen WebRTC |
| Help centre | Ticket + thread link |
| Feed home | Post types: product/weather/calendar/video/job/thought |
| Stories | Top row rings |
| Thought portal | Photo/video composer |
| Live stream | Immersive dark chrome + orange LIVE |
| Friends | Request / suggest / block |
| Online presence | Green/grey dots |

### 12.17 Governance, Risk & Board

**Models:** `board_declaration`, meetings, CEO/Board forms (from feature docs), crisis command

| Screen | Design |
|--------|--------|
| Board portal home | Agenda, resolutions, calendar |
| BOD forms | BOD-FRM-001…006 document workflow |
| CEO decision forms | Approval cards with DOA |
| Risk register | Strategic/Operational/Financial/Legal/Cyber |
| Crisis command | Role roster + incident severity |
| Ethics / conflict | Declaration upload + status |
| Compliance checklist | VAT/Labour/Food/ISO chips |

---

## 13. Role Dashboards

Dashboards are **workspaces** over shared models (`models.md` §24), filtered by `account_type`, `industry_template`, and `enabled_capabilities` — not separate databases. Full portal shells are in §19.

### 13.1 Visual layout rules

- Mobile: vertical stack of KPI → lists → shortcuts
- Desktop: 12-column widget grid
- First viewport = Work + critical KPIs only (no clutter of every report)
- Widgets come from `analytics.dashboard_widget` filtered by `workspace_type` + `role`

### 13.2 Workspace types (all)

| Workspace | Primary users | First-viewport widgets |
|-----------|---------------|------------------------|
| Executive | CEO, Directors | Revenue, cash, risk, approvals, AI |
| Employee | All staff | Mission, tasks, leave, training |
| Production | Plant managers, operators | WO, stages, QC pending, downtime |
| Warehouse | Storekeepers | Stock, GRN, picking, expiry |
| HR | HR team | Headcount, recruitment, attendance, payroll calendar |
| Finance | Finance team | Cash, AP/AR, budget variance |
| Sales | Sales force | Targets, routes, orders, collection |
| AI | All roles | Copilot panel (overlay, not only page) |
| Consumer | End customers | Feed, orders, nearest shop |
| Supplier | Vendors | PO inbox, delivery schedule, invoices |
| Dealer | Distributors (B2B dealer) | Orders, inventory, schemes |
| Retail | Retailers | POS/stock, promotions, nearest consumers |
| Processing / Ops | Any with process_engine | Process runs/stages canvas |
| Software | software template | Backlog→Release stages |
| Construction | construction template | Site stages + materials |
| Marketing prod | marketing template | Brief→Publish + ads |
| Board | Directors / governance | Agenda, resolutions, compliance |
| Admin / Config | IT + org admins | Builders, users, audit |

### 13.3 Customer Dashboard (consumer)

Feed-first social + commerce hybrid:

- Stories row · Thought portal · Feed cards · Nearest shop · Cart/orders · Friends · Live market

Keep orange CTAs for Buy / Order; content chrome stays greyscale.

### 13.4 Seller Centre

Product grid, order queue, stock badges, plan type chips (basic/super/dropshipper), payouts/txn log, ad campaigns.

### 13.5 Manufacture / Operations Dashboard

Widgets: WO status, process stage bottlenecks, stock alerts, QC holds, production vs plan, meetings.

**Menu surfaces:** Purchase, PO, Payment, Dr/Cr Notes, Sales, SO, Received, Action Plan, Working Report, Process Runs/Stages, Stock, Cash/Bank, Damage/Expire, Register, Ledger, Day Book, Income/Expense, P&L, Analytics, Meeting, Team, Distributor.

### 13.6 Software / Construction / Marketing workspaces

Same Process Engine canvas; template-specific empty states and stage icons only.

### 13.7 Distributor / Retail Dashboards

| Portal | Extra menu vs manufacture |
|--------|---------------------------|
| Distributor | Retailer network, Issue Cheque, Credit; hide/minimize process_engine if capability off |
| Retail | Nearest Consumer, POS-like sales; Issue Cheque; stock product |

### 13.8 ASM / DSM / RSM Sales workspaces

| Role | Home focus | Primary screens |
|------|------------|-----------------|
| ASM | Territory targets + today’s route | ASM orders, outlets, collection |
| DSM | Dealer network performance | Dealer SO, schemes, returns |
| RSM | Retail coverage | Retail SO, route, visit reports |

### 13.9 Supplier / Dealer / Board portals (summary)

See §19 for full portal shells. Supplier = PO/GRN/invoice outward view. Dealer overlaps distributor but may be lighter. Board = governance-only, no shop-floor ops.

### 13.10 Executive / Whole Company

CEO daily mandatory metrics (`feature_and_module.md` §19):

Production, Sales, Finance cash, HR attendance, Quality complaints, Maintenance breakdowns, Safety LTA.

Escalation color:

| Achievement | Color |
|-------------|-------|
| ≥100% | Success green |
| 90–99% | Foreground |
| 80–89% | Warning |
| <80% | Danger |

---

## 14. Status, Priority & Lifecycle Visual Language

### 14.1 Object lifecycle (`models.md`)

Draft → Validated → Approved → Active → Suspended → Archived → Disposed

| State | Badge |
|-------|-------|
| Draft | Grey |
| Validated | Info blue soft |
| Approved / Active | Green / Orange soft |
| Suspended | Amber |
| Archived / Disposed | Muted grey |

### 14.2 Task states

New → Assigned → Accepted → In Progress → Pending Approval → Completed → Verified → Closed

Show as **horizontal stepper** on detail; compact badge on lists.

### 14.3 Priority

| Priority | Dot |
|----------|-----|
| low | Grey |
| medium | Info |
| high | Orange |
| critical | Red + optional pulse |

### 14.4 Domain status examples

| Domain | Status → color |
|--------|----------------|
| QC | pass green / fail red / hold amber |
| Payment | paid green / pending amber / failed red |
| Dispatch | planned grey → loaded orange → delivered green |
| Equipment health | green / yellow / red |
| Vendor score A–D | A green … D red |

---

## 15. Consumer Platform Surfaces

Public layer still uses the same theme tokens.

| Surface | Pattern |
|---------|---------|
| Feed | Full-bleed media; orange for follow/buy |
| Live stream | Dark immersive chrome; orange live badge |
| Chat | iMessage-like bubbles; outbound orange soft, inbound surface |
| Calls | Full-screen WebRTC controls |
| Ecommerce PDP | Gallery, price NPR, trust badges, sticky Buy |
| Ads | Native feed cards; clear Sponsored label |
| Search | Text / voice / image tabs |

Enterprise login and consumer login share brand orange but **different post-auth shells**.

---

## 16. Accessibility, Density & Localization

### 16.1 Accessibility

- Contrast: text on black/white meets WCAG AA
- Orange on white: use `#D14C00` or darker for small text if needed; large CTAs may use `#F25C05` with white label (≥4.5:1 verified)
- Focus visible always (orange ring)
- Dynamic type: support iOS text size where possible
- Don’t rely on color alone — include labels/icons for status

### 16.2 Localization

- EN default; NP (नेपाली) toggle
- Currency NPR formatting
- Fiscal calendar awareness (Shrawan–Ashadh) in finance date pickers

### 16.3 Device classes

| Class | Shell |
|-------|-------|
| Phone WebView | iOS native mobile |
| Tablet | Hybrid — bottom tabs or split view |
| Desktop | ERP rail |
| Kiosk / shop floor | Large buttons, scan-first, dark preferred |

---

## 17. Lovable / Implementation Mapping

### 17.1 How to use this file in Lovable

Prompt framing:

1. Apply **Design Tokens** (§18)
2. Build **Mobile shell** (§5) first for My Work Center
3. Generate **component library** (§7–10)
4. Build module screens from §12 using models in `models.md`
5. Add desktop shell (§6) as responsive `md+` breakpoint
6. Wire theme toggle dark/light

### 17.2 Suggested page inventory (MVP UI pack)

1. Login / MFA  
2. My Work Center  
3. Task detail + Approval sheet  
4. Process Run canvas + Stage form  
5. Work Order list/detail  
6. Stock list + Item detail + Scan issue  
7. Purchase Order form + GRN  
8. Sales Order + POD  
9. Finance Day Book + Journal  
10. HR Attendance + Leave  
11. CEO KPI dashboard  
12. Settings (theme, language, profile)  
13. Chat thread  
14. Notifications  

### 17.3 Responsive breakpoints

| Name | Width | Shell |
|------|-------|-------|
| `xs` | 0–389 | Compact phone |
| `sm` | 390–767 | Standard phone |
| `md` | 768–1023 | Tablet hybrid |
| `lg` | 1024–1439 | Desktop ERP |
| `xl` | 1440+ | Wide ERP + context pane |

Below `md`: bottom tabs, sheets, card-lists.  
`md+`: left rail allowed.  
`lg+`: context pane default open on forms.

### 17.4 Do / Don’t for generated UI

**Do**

- Black / white backgrounds with orange primary
- iOS grouped lists on mobile
- Mission-first home
- Metadata-looking forms (sections, dynamic fields)
- Dark and light both polished

**Don’t**

- Purple gradients, glassmorphism glow, emoji icon rows
- Desktop-only tables on mobile without card alternative
- Empty marketing dashboard as home
- Cards around every paragraph
- Hardcode factory-only screens that ignore Process Engine generality

---

## 18. Design Tokens (CSS Variables)

Copy into global CSS / Tailwind theme for Lovable.

```css
:root {
  /* Brand */
  --color-primary: #F25C05;
  --color-primary-hover: #FF6F1F;
  --color-primary-pressed: #D14C00;
  --color-primary-soft: rgba(242, 92, 5, 0.14);
  --color-primary-ring: rgba(242, 92, 5, 0.45);
  --color-on-primary: #FFFFFF;

  /* Semantic */
  --success: #34C759;
  --warning: #FF9F0A;
  --danger: #FF3B30;
  --info: #007AFF;

  /* Light (default) */
  --bg-app: #FFFFFF;
  --bg-elevated: #FFFFFF;
  --bg-surface: #F7F7F8;
  --bg-surface-2: #FFFFFF;
  --bg-surface-3: #EEEEF0;
  --bg-overlay: rgba(0, 0, 0, 0.40);
  --fg-primary: #111111;
  --fg-secondary: #5C5C5C;
  --fg-tertiary: #8E8E93;
  --fg-disabled: #C7C7CC;
  --border-subtle: #E5E5EA;
  --border-strong: #D1D1D6;
  --separator: #E5E5EA;

  /* Shape */
  --radius-xs: 6px;
  --radius-sm: 10px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 22px;

  /* Type */
  --font-ui: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif;
  --font-display: "Sora", "Outfit", var(--font-ui);
  --font-deva: "Noto Sans Devanagari", var(--font-ui);
}

[data-theme="dark"] {
  --bg-app: #000000;
  --bg-elevated: #0A0A0A;
  --bg-surface: #121212;
  --bg-surface-2: #1A1A1A;
  --bg-surface-3: #242424;
  --bg-overlay: rgba(0, 0, 0, 0.72);
  --fg-primary: #FFFFFF;
  --fg-secondary: #B3B3B3;
  --fg-tertiary: #8A8A8A;
  --fg-disabled: #555555;
  --border-subtle: #2A2A2A;
  --border-strong: #3D3D3D;
  --separator: #1F1F1F;

  --success: #30D158;
  --warning: #FFD60A;
  --danger: #FF453A;
  --info: #64D2FF;
}
```

### Tailwind mapping (suggested)

```
colors.primary = var(--color-primary)
colors.background = var(--bg-app)
colors.foreground = var(--fg-primary)
colors.muted = var(--fg-secondary)
colors.card = var(--bg-surface)
colors.border = var(--border-subtle)
```

---

## 19. Portal Architecture (All Entry Points)

A **portal** is the post-login shell: navigation, home workspace, allowed modules, and device layout.  
Routing formula:

```
account_type + org.account_type + industry_template + enabled_capabilities
+ role.permissions_json + department + branch attributes
→ Portal shell + Menu tree + Home widgets
```

### 19.1 Portal catalog (complete)

| Portal ID | Who | Account / template | Shell | Home |
|-----------|-----|--------------------|-------|------|
| `portal.consumer` | End consumer | `user.account_type=consumer` | Mobile social tabs | Customer Dashboard §13.3 |
| `portal.seller` | Any selling org staff | seller org + commerce capability | Mobile + desktop | Seller Centre |
| `portal.manufacture` | Manufacturer employees | `account_type=manufacture` | ERP iOS + desktop rail | Manufacture / Ops §13.5 |
| `portal.operations` | Process-enabled orgs | `process_engine` on | Process-first | Processing canvas |
| `portal.software` | Software orgs | template `software` | Delivery workspace | Stage board |
| `portal.construction` | Construction orgs | template `construction` | Site workspace | Site stages |
| `portal.marketing_prod` | Agencies | template `marketing` | Campaign workspace | Brief→Publish |
| `portal.distributor` | Distributor org | `distributor` | ERP light | Distributor dashboard |
| `portal.retail` | Retailer org | `retailer` | ERP light / POS-ish | Retail dashboard |
| `portal.wholesaler` | Sole wholesaler | `wholeseller_sole` | Same family as distributor | Wholesale stock + party |
| `portal.supplier` | External vendor users | supplier-linked org user | Limited ERP | PO inbox · deliveries · invoices |
| `portal.dealer` | Dealer staff in chain | dealer party / org | Sales-field mobile | Dealer SO · schemes · stock |
| `portal.employee` | Generic staff | `account_type=employee` | My Work tabs | Mission · tasks · HR self-service |
| `portal.sales_field` | ASM / TSO / Rep | sales roles | Field mobile | Route · orders · collection |
| `portal.sales_dsm` | Dealer Sales Mgr | DSM | Hybrid | Dealer network |
| `portal.sales_rsm` | Retail Sales Mgr | RSM | Hybrid | Retail coverage |
| `portal.logistics` | Drivers / dispatch | logistics roles | Trip tabs | Trips · map · POD |
| `portal.warehouse` | Store officers | stores roles | Scan-first | Stock · GRN · issue |
| `portal.production_floor` | Operators | production roles | Big-button dark preferred | Active stage · scan · report |
| `portal.qa` | QA/QC staff | quality roles | Inspection inbox | Pending QC · release |
| `portal.maintenance` | Technicians | maintenance roles | WO inbox | Breakdown · PM due |
| `portal.hr` | HR team | HR department | Desktop-leaning | Recruitment · attendance · payroll |
| `portal.finance` | Finance team | Finance dept | Dense desktop | Cash · vouchers · AP/AR |
| `portal.procurement` | Buyers | Procurement | Desktop + mobile approve | PR · RFQ · PO |
| `portal.it` | IT / CIO staff | IT dept | Admin + tickets | Helpdesk · assets · access |
| `portal.rd` | R&D | R&D dept | Stage-gate | Ideas · trials · gates |
| `portal.executive` | CEO / Directors | executive roles | KPI-first | CEO daily dashboard |
| `portal.board` | Board members | board roles | Governance | Agenda · resolutions · DOA |
| `portal.admin` | Org primary admin / IT admin | `is_primary_admin` / system | Config builders | Users · roles · metadata · audit |
| `portal.chat` | All (overlay) | any authenticated | Overlay / tab | Threads · calls · help |

### 19.2 Login → portal resolver (UI)

1. Auth success → load actor + org + role + capabilities  
2. If multiple orgs → **Org picker** (logo, VAT/PAN, account_type chip)  
3. Resolve portal ID (table above; most specific wins)  
4. If user has executive + employee duties → **portal.executive** home with switcher to department portals  
5. Soft-fail: unknown role → `portal.employee` + AI hint “Ask admin for capabilities”

### 19.3 Portal chrome differences

| Portal family | Mobile chrome | Desktop chrome |
|---------------|---------------|----------------|
| Consumer | 5-tab social (Home/Search/Sell-entry/Chat/Me) | Optional wide feed |
| Field (sales/logistics/attendance) | 5-tab work apps | Rare; tablet split ok |
| Shop-floor (prod/warehouse/QA) | Scan + big CTAs; dark default | Tablet kiosk landscape |
| ERP department | Bottom tabs subset + “More” sheet | Left rail full |
| Executive | Mission / KPI / Approvals | Wide KPI canvas + approval tray |
| Board | Document-first lists | Committee calendar + packs |
| Admin | Limited mobile | Full builders |

### 19.4 Cross-portal elements (always available if permitted)

- My Work (tasks/approvals)  
- Notifications  
- Global search  
- AI Copilot  
- Chat  
- Profile / Theme / Language  
- Help ticket  

### 19.5 Multi-portal users

Show a **Portal / Workspace switcher** (top bar avatar menu):

```
Sunyazon · Manufacture
  ☑ Executive
  ○ Finance
  ○ Approvals only
```

Never show modules outside `permissions_json` even if portal switcher lists a workspace.

---

## 20. Roles, Permissions & Adaptive Navigation

### 20.1 Authorization layers (must reflect in UI)

| Layer | Source | UI effect |
|-------|--------|-----------|
| **RBAC** | `organization.role` + `permissions_json` | Show/hide menu items & actions |
| **ABAC** | branch, department, shift, product line, territory | Filter **data** in lists (Kathmandu-only etc.) |
| **Policy / DOA** | `core.policy`, amount limits | Disable Approve; show “Needs CEO” banner |
| **Capability** | `organization.enabled_capabilities` | Hide whole module groups (e.g. no BOM) |
| **Lifecycle** | object status | Edit only in draft; lock posted vouchers |
| **Access level** | Read / Entry / Update / Administration | Controls vs view-only chrome |

### 20.2 Access levels (ERP) — visual rules

| Level | Code | User can | UI pattern |
|-------|------|----------|------------|
| Read | `R` | View lists/detail/reports | No primary Create; fields read-only |
| Entry | `C` | Create drafts | Orange Create; Submit may need approval |
| Update | `U` | Edit allowed states | Inline edit / Save |
| Administration | `A` | Config, masters, publish metadata | Settings gear + builders |

Combine flags per object: e.g. `sales_order: R+C`, `chart_of_accounts: R` only.

### 20.3 Shunyajon hierarchy roles → default portals

| Role (EN / NP) | Default portal | Data scope | Typical levels |
|----------------|----------------|------------|----------------|
| Board Director | `portal.board` | Org group | R on packs; A on resolutions |
| CEO / MD | `portal.executive` | All org | Approvals per DOA; R everywhere |
| महाप्रबन्धक (GM) | `portal.executive` | All depts reports | R finance details; A on cross-dept |
| Director (Factory/Finance/HR/Sales/IT) | department portal + executive widgets | Own Directorate | A department; R cross |
| प्रबन्धक (Manager) | dept portal | Own department | A ops within dept |
| शाखा प्रमुख (Branch Head) | hybrid field/ERP | Own branch | A branch daily ops |
| Officer / Inspector | dept portal | Own function | C+U own records |
| ASM / DSM / RSM | sales portals | Territory / dealers / retail | C orders; R targets |
| Operator / Helper / Driver / Security | floor / logistics / employee | Own tasks only | C evidence; R own attendance |
| Org Primary Admin | `portal.admin` | Tenant org config | A users/roles/capabilities |
| Supplier user | `portal.supplier` | Own POs/invoices | R+C delivery notes |
| Consumer | `portal.consumer` | Own profile/orders | Full self |

### 20.4 Permission keys (canonical UI keys)

Use stable permission codes in menus (examples — extend via metadata):

```
work.mission.read
work.task.*
work.approval.act
hr.employee.read|create|update
hr.attendance.self|team|admin
hr.payroll.run|approve
finance.voucher.create|post|void
finance.coa.admin
purchase.pr.*
purchase.po.approve
inventory.stock.read|adjust
inventory.grn.create
production.wo.*
production.process.run
quality.inspect.*
quality.release.approve
sales.order.*
sales.price.override
logistics.dispatch.*
logistics.pod.capture
crm.complaint.*
maintenance.wo.*
analytics.kpi.read
analytics.report.build
admin.user.*
admin.role.*
admin.metadata.publish
admin.audit.read
commerce.product.*
commerce.order.fulfill
chat.*
document.*
board.resolution.*
```

Wildcards `*` = create/read/update/delete/approve as defined in Role Builder.

### 20.5 Adaptive navigation engine (UI behavior)

Menu = intersection of:

1. Portal default menu template  
2. Enabled capabilities  
3. Role permission keys  
4. Device (hide dense builders on phone)  
5. Language labels  

**Empty states:** If a user opens a deep link without permission → full-screen “No access” with request-access CTA (creates IT ticket).

### 20.6 Forbidden vs hidden

| Rule | Behavior |
|------|----------|
| No permission | **Hide** nav item (prefer) |
| Permission but policy blocks action | Show item; **disable** button + reason sheet |
| Confidential salary/bank | Column-level hide; lock icon on section |
| Audit | Never show delete on `audit_log` |

### 20.7 Role Builder UI (admin)

Desktop split canvas:

- Left: roles list  
- Center: permission tree checkboxes (module → object → level)  
- Right: live menu preview for that role on mobile + desktop frames  
- Publish = workflow-approved metadata version  

### 20.8 Attribute filters UI

On every list for scoped roles, show a subtle filter chip under title:

`Branch: Kathmandu ▼` · `Dept: Production` · locked if user cannot change scope.

---

## 21. Role → Menu → Screen → Permission Matrix

Legend: **R** read · **C** create/entry · **U** update · **A** admin · **P** approve · **—** none

### 21.1 Executive & Governance

| Screen / Module | CEO | GM | Board | Director |
|-----------------|-----|-----|-------|----------|
| My Work / Approvals | R+P | R+P | R+P (board items) | R+P dept |
| CEO Daily KPI | R | R | R summary | R own + company |
| CAPEX / Budget | P per DOA | R | P >5M | R / recommend |
| Board packs / Resolutions | R | R | R+C+P | R |
| All department reports | R | R | R | Own dept A |
| User/role admin | — | — | — | — (IT) |

### 21.2 HR

| Screen | HR Officer | HR Manager | HR Director | Employee (self) |
|--------|------------|------------|-------------|-----------------|
| Employee master | C+U | A | A | R self |
| Vacancies / Applicants | C+U | A+P | A+P | Apply (consumer/feed) |
| Attendance | R team | A | A | C self punch |
| Leave | R | P | P long leave | C self |
| Payroll run | C | P | P | R payslip self |
| Training / Gurukul | U | A | A | R+C complete |
| Onboarding tasks | U | A | A | U own checklist |

### 21.3 Finance & Procurement

| Screen | Accountant | Finance Mgr | CFO | Procurement Officer | Procurement Head |
|--------|------------|-------------|-----|---------------------|------------------|
| Journal / vouchers | C | P | A | — | — |
| Post voucher | — | P | A | — | — |
| Daybook / Ledger / P&L | R | R | A | R limited | R limited |
| PR | — | R | R | C | P |
| RFQ / CS / Vendor | — | R | R | C+U | A+P |
| PO | — | P mid | P high | C | P |
| Payment | C draft | P | A | — | R |
| Tax filing | C | P | A | — | — |

### 21.4 Production / Process / Warehouse / QA

| Screen | Operator | Supervisor | Factory Dir | Store Officer | Store Mgr | QA Inspector | QA Mgr |
|--------|----------|------------|-------------|---------------|-----------|--------------|--------|
| Work Order | R | C+U | A+P | R | R | R | R |
| Process stage entry | C own | U+P | A | — | — | R | R |
| Material issue | — | R | R | C | P | — | — |
| Stock / GRN | — | R | R | C+U | A | R QC gate | R |
| Stock adjust | — | — | P | C | P | — | — |
| Incoming / IPQC | — | R | R | R | R | C | A |
| Final release | — | — | R | — | — | — | P |
| NCR / CAPA | C | U | P | C | U | C+U | A+P |

### 21.5 Sales / Logistics / CRM

| Screen | Sales Rep | ASM | DSM | RSM | Sales Dir | Driver | Dispatch Officer | Logistics Mgr |
|--------|-----------|-----|-----|-----|-----------|--------|------------------|---------------|
| ASM order | C | A+P | R | R | R | — | — | — |
| Dealer SO | — | R | C+U | R | A | — | R | R |
| Retail SO | — | R | R | C+U | A | — | R | R |
| Route / visit | C | A | R | A | R | — | — | — |
| Collection | C | U | U | U | A | — | — | — |
| Price override | — | — | P limited | P limited | P | — | — | — |
| Dispatch | — | R | R | R | R | R | C+U | A |
| POD | — | R | R | R | R | C | R | A |
| Complaints | C | U | U | U | P | — | — | — |

### 21.6 Maintenance / IT / R&D / Admin

| Screen | Technician | Maint Mgr | IT Officer | CIO | R&D Officer | R&D Mgr | Org Admin |
|--------|------------|-----------|------------|-----|-------------|---------|-----------|
| Maint WO | C+U | A+P | — | — | — | — | — |
| PM / Calibration | U | A | — | — | — | — | — |
| IT ticket | C | — | U | A | C | C | C |
| User access | — | — | C | P | — | — | A |
| Metadata / Role Builder | — | — | R | P | — | — | A |
| Audit log | — | — | R | R | — | — | R |
| Stage-gate / Trial | — | — | — | — | C+U | A+P | — |
| Capabilities toggle | — | — | — | P | — | — | A |

### 21.7 Consumer / Seller / Supplier portals

| Screen | Consumer | Seller staff | Supplier user |
|--------|----------|--------------|---------------|
| Feed / social | R+C | R+C org posts | — |
| PDP / Cart / Order | C | Fulfill U | — |
| KYC / Profile | U | U | U |
| Seller catalogue | — | C+U | — |
| PO inbox | — | — | R |
| Confirm delivery / invoice | — | — | C |
| Chat | Yes | Store/product threads | PO threads |
| Ads | — | C campaigns | — |

### 21.8 Menu templates per portal (mobile More + desktop rail)

#### `portal.manufacture` (full)

My Work · Process · Inventory · Procurement · Sales · Quality · Maintenance · Finance · HR · Logistics · CRM · Meetings · Analytics · Documents · Chat · Settings  

#### `portal.distributor`

My Work · Purchase · Sales · Stock · Finance (subset) · Retailers · Meetings · Team · Analytics · Chat · Settings  

#### `portal.retail`

My Work · Purchase · Sales · Stock · Finance (subset) · Consumers · Meetings · Team · Analytics · Chat · Settings  

#### `portal.consumer`

Home · Search · Cart · Chat · Me  

#### `portal.supplier`

Inbox (PO) · Deliveries · Invoices · Chat · Profile  

#### `portal.executive`

Mission · KPI · Approvals · Alerts · Departments (deep links) · AI · Chat · Me  

#### `portal.board`

Home · Calendar · Documents · Resolutions · Compliance · Profile  

#### `portal.admin`

Users · Roles · Capabilities · Form Builder · Workflow Builder · Menus · Reports · Audit · Integrations · Theme  

Hide any item failing §20.4 keys.

### 21.9 Action strip permission mapping

| UI action | Required |
|-----------|----------|
| Create (FAB) | `*.create` or Entry |
| Save draft | create/update |
| Submit | create + workflow start |
| Approve / Reject | `*.approve` or Approval Engine assignee |
| Post / Release / Void | admin-or-policy level |
| Export | `*.read` + export flag |
| Delete / Archive | update + not immutable |

---

## 22. Complete Feature → UI Coverage Register

Maps `feature_and_module.md` / `project.md` capabilities to UI. Status: **Designed** = has screen pattern in this file.

### 22.1 Platform core

| Feature | UI surface | Status |
|---------|------------|--------|
| Multi-tenant / multi-org | Org picker, tenant context chip | Designed |
| Capability enable/disable | Org setup switches | Designed |
| Mission-driven home | My Work Center | Designed |
| Task engine states | Task detail stepper | Designed |
| Approval modes | Approval inbox + strip | Designed |
| Workflow designer | Admin builder canvas | Designed |
| Rule / Policy engines | Admin rule cards + runtime banners | Designed |
| Metadata forms | Form engine §8 | Designed |
| Notifications all channels | Notification center | Designed |
| Audit immutable | Timeline read-only | Designed |
| Global / AI / Knowledge search | Search tabs + Copilot | Designed |
| Config builders (Form/WF/Role/Menu/Report/Rule) | Admin canvases | Designed |

### 22.2 Department / ERP features

| Domain | Features (compressed) | Primary UI | Status |
|--------|----------------------|------------|--------|
| Production | PPC, MRP, WO, batch, BOM, issue, WIP, FG, costing, OEE, daily report, packaging, safety | Process + WO screens §12.6 | Designed |
| Procurement | PR, RFQ, CS, PO, GRN match, AVL, eval, audit, import/LC, emergency, contract, SCAR, reorder | §12.5b | Designed |
| Stores | Item master, GRN, ledgers, issue, FG/spare, FIFO/FEFO, ABC, audit, quarantine, barcode | §12.7 | Designed |
| QA/QC | IQC, IPQC, final release, lab, NCR, CAPA, HACCP, recall, artwork, quality master | §12.8 | Designed |
| Maintenance | PM, breakdown, WO, equipment, spares, calibration, TPM/OEE, permits, energy, ECR | §12.11 | Designed |
| Sales | Territory, route, orders, distributor/MT/institutional, schemes, CRM, export, collection, pricing | §12.9 | Designed |
| Finance | GL, AP/AR, budget, costing, VAT/TDS, treasury, assets, CAPEX, bank recon, payroll link, NFRS reports | §12.5 | Designed |
| HR | Manpower, recruit, employee, attendance, leave, payroll, appraisal, Gurukul, onboard, welfare, exit | §12.4 | Designed |
| Logistics | Dispatch, docs, vehicles, routes, GPS, POD, returns, fuel, driver KPI | §12.9 | Designed |
| IT | ERP admin, helpdesk, assets, backup, security, BI, DMS, network, mobile apps admin | §12.13 | Designed |
| R&D | Ideas, recipe, trials, sensory, shelf life, packaging, stage-gate, transfer, innovation register | §12.13 | Designed |
| CRM | Complaints, pipeline, activities | §12.10 | Designed |

### 22.3 Consumer & commerce features

| Feature | UI | Status |
|---------|-----|--------|
| Auth/KYC/geo address | Auth screens | Designed |
| Feed posts + engagement | Feed | Designed |
| Media / live / playlists | Media surfaces | Designed |
| Ecommerce catalogue/cart/order/review | Shop | Designed |
| Pick-drop / nearest shop | Map flows | Designed |
| Payments gateways | Checkout + txn log | Designed |
| Ads plans/campaigns/impressions | Seller ads | Designed |
| Friends / stories / thought / live market | Social extras | Designed |
| Chat / calls / help | Chat centre | Designed |
| Documents / blogs / MOU | Docs | Designed |
| Channels subscribe | Channel directory | Designed |

### 22.4 Mobile apps (named)

| App | Portal mapping | Key screens |
|-----|----------------|-------------|
| Sales App | `portal.sales_field` (+ ASM/DSM/RSM) | Route, order, visit, collection |
| Attendance App | `portal.employee` attendance tab | Punch, leave, shifts |
| Logistics App | `portal.logistics` | Trips, map, POD, fuel |

Same design system; installable PWA / WebView wrappers.

### 22.5 Governance features

| Feature | UI | Status |
|---------|-----|--------|
| Board forms BOD-FRM-* | Board portal docs | Designed |
| CEO forms / DOA | Executive approvals | Designed |
| Risk register / crisis command | Governance §12.17 | Designed |
| Compliance (IRD, Labour, Food, ISO) | Checklist + filings | Designed |

### 22.6 Roadmap features (UI placeholders only)

Smart Factory IoT tiles, Digital Twin, Blockchain traceability, Capability Marketplace, Passkey auth — show as “Coming” badges in Settings / IT roadmap; do not invent full production UI yet.

---

## 23. Department KPI Dashboard Specs

Each department KPI dashboard = mission strip + KPI cards + exception list + shortcut to operational menus. Targets from `feature_and_module.md`.

### 23.1 Shared KPI card pattern

```
[Label grey]
[Actual large]     [Target caption]
[Progress bar orange if on-track / red if escalate]
[Δ vs prior period chip]
```

### 23.2 Procurement KPI

OTD >95% · Cost saving ≥5% · Supplier quality >98% · Purchase cycle ≤7d · Emergency purchase <3% · Material availability >99%

### 23.3 Production KPI

Plan ≥98% · OEE ≥85% · Downtime ≤3% · Yield ≥98% · Rejection ≤1%

### 23.4 Inventory KPI

Accuracy >99% · Turnover >12× · Inventory days ≤45 · Reorder breach count

### 23.5 QA KPI

Complaint ≤0.5% · Recall = 0 · CAPA closure 100% · GMP 100%

### 23.6 Maintenance KPI

PM >95% · OEE >85% · MTTR <2h · Breakdown <2%

### 23.7 Sales KPI

Achievement >100% · Collection >95% · Outlet coverage >95% · Complaint ≤48h · Numeric distribution >90%

### 23.8 Finance KPI

Collection >95% · Budget >95% · Receivable days ≤30 · Payable ≤60 · Audit 100%

### 23.9 HR KPI

Retention ≥95% · Turnover <5% · Training 100% · Recruitment <30d · Engagement ≥85% · Absenteeism <3%

### 23.10 Logistics KPI

OTD >95% · Delivery accuracy >99% · POD 100% · Fuel KM/L

### 23.11 R&D KPI

≥5 launches/year · Trial success >90% · ≥3 cost-reduction projects

### 23.12 IT KPI

ERP uptime ≥99.5% · Backup 100% · Zero major cyber · Ticket SLA by priority

### 23.13 CEO Master KPI (weights)

Finance 30% · Operations 25% · Quality 15% · HR 15% · Strategic growth 15% — scorecard rings on executive canvas.

---

## Appendix A — Model → Screen → Component Map (quick)

| Model group | Primary screen | Components |
|-------------|----------------|------------|
| `core.task` / `approval` | Work / Approvals | Task card, stepper, action sheet |
| `production.process_run*` | Process canvas | Stage cards, line editor |
| `production.work_order` | WO detail | KPI header, links, status |
| `inventory.*` | Stock / GRN / Issue | List cards, scan CTA, meters |
| `finance.*` | Vouchers / Daybook | Grid, amount cells, DOA meter |
| `purchase.*` | PR / RFQ / Vendor | Compare sheet, AVL badges |
| `hr.attendance` / leave | Attendance / Leave | Big CTA, calendar, form |
| `sales.*` / `logistics.*` | Orders / Dispatch / POD | Cart lines, map sheet, signature |
| `quality.*` | Inspections / Release | Pass-fail rows, release sheet |
| `crm.*` | Pipeline / Complaints | Kanban, SLA clock |
| `maintenance.*` | Equipment / WO | Health index, timers |
| `analytics.*` | Dashboards | KPI cards, charts |
| `commerce.*` / `social.*` | Shop / Feed | Media cards, PDP sticky buy |
| `marketing.*` / payments | Ads / Checkout | Plan cards, gateway select |
| `ai.*` / search | Global search | Text/voice/image tabs |
| `communication.*` | Chat / Calls | Bubbles, call chrome |
| `document.*` | Docs | Preview canvas |
| `organization.*` | Org / Capabilities | Wizard, switches, tree |
| Board / CEO forms | Governance portals | Pack list, DOA meter |

---

## Appendix B — Reference documents

| File | Role |
|------|------|
| `project.md` | Vision, engines, 11 departments, governance |
| `models.md` | Canonical tables and relations |
| `feature_and_module.md` | Forms, workflows, KPIs, field specs |
| `design.md` | Visual UI + portals + roles/permissions constitution |

---

## Appendix C — Coverage checklist (for Lovable / QA)

Use this before calling the design “complete”:

- [ ] All portals in §19.1 have a shell + home
- [ ] Role matrices in §21 applied to menus (hide unauthorized)
- [ ] Access levels R/C/U/A visible in Form/Role builders
- [ ] Modules §12.1–12.17 each have at least list + detail + create
- [ ] Feature register §22 marked Designed for MVP scope
- [ ] Department KPIs §23 wired to executive + dept homes
- [ ] Dark + light orange theme tokens verified on every portal chrome
- [ ] Mobile iOS webview patterns on field/floor portals
- [ ] Desktop ERP rail on finance/HR/admin/executive

---

*Design constitution for Sunyazon / BEOS. Use with Lovable or any frontend stack. Prefer mobile iOS-native webview ERP patterns first; scale to dense desktop ERP. Themes: orange primary on black (dark) and white (light) with white/grey foreground hierarchy. Portals resolve from account type + capabilities + role permissions; UI never shows work the user cannot access.*
