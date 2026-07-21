# Sunyazon / BEOS — Complete Data Models Reference

**Document purpose:** Exact modules and database models for the full Sunyazon platform (consumer social/ecommerce + enterprise ERP), synthesized from user requirements (points 1–22), `project.md`, `feature_and_module.md`, and `schemas/`.

**Platform:** BEOS — Business Ecosystem Operating System  
**Company:** Sunyzon Company Pvt. Ltd. (शुन्यजोन)  
**Primary DB:** PostgreSQL (multi-tenant, schema-separated)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [PostgreSQL Schemas](#2-postgresql-schemas)
3. [Core Platform Models](#3-core-platform-models)
4. [Auth & Identity Models](#4-auth--identity-models)
5. [Organization Models](#5-organization-models)
6. [Platform & Channel Models](#6-platform--channel-models)
7. [Search & AI Models](#7-search--ai-models)
8. [Feed Models](#8-feed-models)
9. [Media & Live Stream Models](#9-media--live-stream-models)
10. [Ecommerce & Seller Centre Models](#10-ecommerce--seller-centre-models)
11. [Payment & Advertisement Models](#11-payment--advertisement-models)
12. [Documentation Models](#12-documentation-models)
13. [Customer Dashboard Models](#13-customer-dashboard-models)
14. [Chat Centre Models](#14-chat-centre-models)
15. [HR & Administration Models](#15-hr--administration-models)
16. [Finance & Accounts Models](#16-finance--accounts-models)
17. [Process Engine & Production Models](#17-process-engine--production-models) (industry-agnostic)
18. [Store & Inventory Models](#18-store--inventory-models)
19. [Sales, Logistics & Distribution Models](#19-sales-logistics--distribution-models)
20. [Quality (QA/QC) Models](#20-quality-qaqc-models)
21. [CRM Models](#21-crm-models)
22. [Maintenance Models](#22-maintenance-models)
23. [Analytics & Dashboard Models](#23-analytics--dashboard-models)
24. [Role Dashboard Map](#24-role-dashboard-map)
25. [Services → Capability → Models Map](#25-services--capability--models-map)
26. [Entity Relationship Summary](#26-entity-relationship-summary)
27. [Build Order](#27-build-order)
28. [Model Count Summary](#28-model-count-summary)

---

## 1. Architecture Overview

The platform is **two layers on one core**:

| Layer | Purpose |
|-------|---------|
| **Core Platform** | Identity, Organization, Workflow, Metadata, Task, Approval, Audit, AI, Search, **Process Engine** |
| **Public Layer** | Consumer auth/KYC, Feed, Media, Ecommerce, Chat, Customer Dashboard |
| **Enterprise Layer** | Org accounts, HR, Finance, Process/Production, Sales, Inventory, Role Dashboards |

**Account types (org):** `manufacture` | `distributor` | `wholeseller_sole` | `retailer` | (extendable: `software` | `construction` | `marketing` | `services` | `custom`)

**Actor types:** Human (Consumer, Retail Staff, Dealer, Factory Worker, Manager, CEO), AI Agent, System, Machine/IoT

**Every record carries:** `tenant_id`, `organization_id` (where applicable), audit fields

**Object lifecycle:** Draft → Validated → Approved → Active → Suspended → Archived → Disposed

### 1.1 Process Engine principle (industry-agnostic)

Do **not** hardcode factory-only tables (`mixing_row`, `packaging_job`, `processing_refine`) as the core.

| Layer | What it is |
|-------|------------|
| **Universal Process Engine** | Same tables for every industry: definition → stages → work order → run → lines |
| **Metadata (per org)** | Custom stage names, fields, forms, validation, KPIs — no new code |
| **Industry template packs** | Optional starters (FMCG, chocolate, software, construction, marketing) copied into the org on setup |

Factory UI may still **label** stages “Mixing” / “Packaging” — those are metadata labels, not separate DB tables. Finance, inventory, HR, quality, and reports always link via `work_order_id` / `process_run_id` / `process_run_stage_id`.

---

## 2. PostgreSQL Schemas

| Schema | Purpose |
|--------|---------|
| `core` | Tenants, config, metadata, business objects |
| `identity` | Users, auth, KYC, sessions |
| `organization` | Companies, branches, departments, org accounts |
| `social` | Feed, friends, stories, posts, channels |
| `commerce` | Products, orders, seller centre, carts |
| `media` | Video, audio, image, live streams (WebRTC) |
| `communication` | Chat, voice/video calls, help centre |
| `document` | Word/Excel/PPT, blogs, templates, MOU |
| `marketing` | Ads, campaigns, plans |
| `workflow` | Tasks, approvals, missions |
| `sales` | B2B sales (ASM / DSM / RSM) |
| `purchase` | Purchase, PO, GRN (linked to finance) |
| `production` | Process Engine: definitions, stages, work orders, runs, BOM/batch (optional) |
| `inventory` | Stock, warehouse, item master |
| `finance` | Ledger, daybook, tax, vouchers |
| `hr` | Recruitment, payroll, attendance, training |
| `crm` | Complaints, pipeline, customer follow-up |
| `quality` | IQC, IPQC, Final QA, NCR, CAPA |
| `maintenance` | PM, breakdown, assets, spare parts |
| `logistics` | Dispatch, POD, vehicles, routes |
| `analytics` | Reports, KPI snapshots, dashboards |
| `audit` | Immutable logs |
| `ai` | Search, image match, OCR, embeddings |
| `integration` | Payment gateway, banking, SMS |
| `notification` | Push, SMS, email |

---

## 3. Core Platform Models

### 3.1 `core.tenant`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| name | String | |
| slug | String Unique | |
| status | Enum | active, suspended, archived |
| settings_json | JSON | |
| created_at | DateTime | |
| updated_at | DateTime | |

### 3.2 `core.actor`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| tenant_id | FK | |
| actor_type | Enum | human, ai, system, machine |
| user_id | FK Nullable | |
| organization_id | FK Nullable | |
| authority_level | Int | |
| approval_limit | Currency | |
| created_at | DateTime | |

### 3.3 `core.business_object`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| object_code | String Unique | e.g. PRODUCT, SALES_ORDER |
| name | String | |
| schema_name | String | |
| table_name | String | |
| lifecycle_states | JSON Array | |
| version | Int | |
| created_at | DateTime | |

### 3.4 `core.metadata_form`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| object_code | String | |
| version | Int | |
| layout_json | JSON | |
| fields_json | JSON | |
| validation_rules | JSON | |
| status | Enum | draft, published, archived |
| created_at | DateTime | |

### 3.5 `core.workflow_definition`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| code | String | |
| name | String | |
| version | Int | |
| trigger_event | String | |
| steps_json | JSON | |
| sla_config | JSON | |
| status | Enum | draft, published, archived |
| created_at | DateTime | |

### 3.6 `core.workflow_instance`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| definition_id | FK | |
| tenant_id | FK | |
| org_id | FK | |
| entity_type | String | |
| entity_id | UUID | |
| current_step | String | |
| status | Enum | running, completed, cancelled, failed |
| started_at | DateTime | |
| completed_at | DateTime Nullable | |

### 3.7 `core.task`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| tenant_id | FK | |
| org_id | FK | |
| assignee_id | FK Actor | |
| workflow_instance_id | FK Nullable | |
| title | String | |
| priority | Enum | low, medium, high, critical |
| due_at | DateTime | |
| status | Enum | new, assigned, accepted, in_progress, pending_approval, completed, verified, closed |
| checklist_json | JSON | |
| evidence_urls | JSON Array | |
| created_at | DateTime | |

### 3.8 `core.approval`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| task_id | FK | |
| approver_id | FK Actor | |
| level | Int | |
| decision | Enum | pending, approved, rejected, returned |
| remarks | Text | |
| decided_at | DateTime Nullable | |

### 3.9 `core.policy`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| org_id | FK | |
| rule_code | String | |
| condition_json | JSON | |
| action_json | JSON | |
| effective_from | Date | |
| effective_to | Date Nullable | |
| is_active | Boolean | |

### 3.10 `core.rule`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| org_id | FK | |
| name | String | |
| condition_json | JSON | e.g. stock < minimum |
| action_json | JSON | e.g. create purchase request |
| is_active | Boolean | |

### 3.11 `audit.audit_log`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| tenant_id | FK | |
| actor_id | FK | |
| entity_type | String | |
| entity_id | UUID | |
| action | String | |
| before_json | JSON | |
| after_json | JSON | |
| ip | String | |
| device | String | |
| created_at | DateTime | Immutable; no delete |

### 3.12 `notification.notification`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| user_id | FK | |
| channel | Enum | email, sms, push, in_app |
| type | Enum | task, approval, reminder, escalation, warning, emergency, ai, compliance |
| title | String | |
| body | Text | |
| is_read | Boolean | |
| created_at | DateTime | |

---

## 4. Auth & Identity Models

### 4.1 `identity.user`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| tenant_id | FK | |
| username | String Unique | |
| email | String Unique Nullable | |
| phone | String Unique Nullable | |
| password_hash | String | |
| account_type | Enum | consumer, organization, employee |
| is_active | Boolean | |
| is_kyc_verified | Boolean | |
| email_verified_at | DateTime Nullable | |
| phone_verified_at | DateTime Nullable | |
| mfa_enabled | Boolean | |
| last_login_at | DateTime Nullable | |
| created_at | DateTime | |
| updated_at | DateTime | |

### 4.2 `identity.user_profile`

| Field | Type | Notes |
|-------|------|-------|
| user_id | PK / FK | |
| full_name | String | |
| gender | Enum | male, female, other, prefer_not_to_say |
| date_of_birth | Date | |
| country_id | FK | |
| province_id | FK Nullable | |
| district_id | FK | |
| municipality_id | FK | |
| ward | String / Int | |
| profile_picture_url | URL | |
| cover_picture_url | URL | |
| bio | Text | |
| language_preference | String | |
| updated_at | DateTime | |

### 4.3 `identity.kyc_document`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| user_id | FK | |
| citizenship_no | String | |
| citizenship_front_url | URL | |
| citizenship_back_url | URL | |
| verification_status | Enum | pending, approved, rejected |
| verified_by | FK Nullable | |
| verified_at | DateTime Nullable | |
| rejection_reason | Text | |
| created_at | DateTime | |

### 4.4 `identity.address`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| user_id | FK | |
| type | Enum | home, billing, shipping |
| country | String | |
| district | String | |
| municipality | String | |
| ward | String | |
| street | String | |
| lat | Decimal Nullable | |
| lng | Decimal Nullable | |
| is_default | Boolean | |

### 4.5 `identity.session`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| user_id | FK | |
| token_hash | String | |
| device_info | String | |
| ip | String | |
| expires_at | DateTime | |
| created_at | DateTime | |

### 4.6 Reference: Geo Masters

#### `identity.country`

| Field | Type |
|-------|------|
| id | PK |
| name | String |
| code | String |
| phone_code | String |

#### `identity.province`

| Field | Type |
|-------|------|
| id | PK |
| country_id | FK |
| name | String |

#### `identity.district`

| Field | Type |
|-------|------|
| id | PK |
| province_id | FK |
| name | String |

#### `identity.municipality`

| Field | Type |
|-------|------|
| id | PK |
| district_id | FK |
| name | String |
| type | Enum | municipality, rural_municipality, metro, sub_metro |

---

## 5. Organization Models

### 5.1 `organization.organization`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| tenant_id | FK | |
| parent_org_id | FK Nullable | Holding / subsidiary |
| org_type | Enum | manufacturer, distributor, wholesaler, retailer, consumer_org, supplier, software, construction, marketing, services, other |
| account_type | Enum | manufacture, distributor, wholeseller_sole, retailer, software, construction, marketing, services, custom |
| industry_template_code | String Nullable | FK-like to `production.industry_template.code` installed at setup |
| enabled_capabilities | JSON Array | e.g. `["process_engine","bom","batch","warehouse","qc"]` |
| company_name | String | |
| slug | String Unique | |
| vat_pan_no | String Unique | Login username for org |
| official_phone | String | |
| official_email | String | |
| address | Text | |
| country_id | FK | |
| logo_url | URL | |
| cover_photo_url | URL | |
| witness_id_for_buyer_url | URL | |
| nat_pan_document_url | URL | VAT/PAN document |
| bank_name | String | |
| bank_account_no | String | |
| bank_branch | String | |
| is_active | Boolean | |
| is_verified | Boolean | |
| created_at | DateTime | |
| updated_at | DateTime | |

### 5.2 `organization.org_user`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| organization_id | FK | |
| user_id | FK | |
| role_id | FK | |
| username | String | Typically VAT/PAN no |
| designation | String | |
| is_primary_admin | Boolean | |
| created_at | DateTime | |

### 5.3 `organization.role`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| org_id | FK | |
| name | String | |
| permissions_json | JSON | |
| is_system | Boolean | |

### 5.4 `organization.department`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| org_id | FK | |
| name | String | |
| code | String | |
| parent_id | FK Nullable | |
| head_employee_id | FK Nullable | |

### 5.5 `organization.branch`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| org_id | FK | |
| name | String | |
| code | String | |
| address | Text | |
| lat | Decimal Nullable | |
| lng | Decimal Nullable | |
| is_active | Boolean | |

### 5.6 `organization.team`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| dept_id | FK | |
| name | String | |
| leader_id | FK Employee | |

### 5.7 `organization.board_declaration`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| org_id | FK | |
| declaration_type | Enum | board, ceo_md |
| document_url | URL | |
| signed_by | String | |
| signed_at | DateTime | |
| status | Enum | draft, signed, archived |

### 5.8 `organization.meeting`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| org_id | FK | |
| title | String | |
| agenda | Text | |
| scheduled_at | DateTime | |
| location | String | |
| organizer_id | FK | |
| minutes_doc_id | FK Document Nullable | |
| status | Enum | scheduled, completed, cancelled |

### 5.9 `organization.meeting_attendee`

| Field | Type | Notes |
|-------|------|-------|
| meeting_id | FK | |
| employee_id | FK | |
| attendance_status | Enum | invited, present, absent, excused |

---

## 6. Platform & Channel Models

### 6.1 `social.platform_channel`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| code | String Unique | |
| name | String | |
| category | Enum | social_media, media, gaming, official, editing, business, language |
| icon_url | URL | |
| is_active | Boolean | |

### 6.2 `social.user_channel_subscription`

| Field | Type | Notes |
|-------|------|-------|
| user_id | FK | |
| channel_id | FK | |
| subscribed_at | DateTime | |
| PK | (user_id, channel_id) | |

---

## 7. Search & AI Models

### 7.1 `ai.search_query_log`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| user_id | FK Nullable | |
| query_type | Enum | text, voice, image, scan |
| query_text | Text | |
| image_url | URL Nullable | |
| voice_audio_url | URL Nullable | |
| results_count | Int | |
| created_at | DateTime | |

### 7.2 `ai.image_match_result`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| source_image_url | URL | |
| matched_product_id | FK Nullable | |
| matched_entity_type | String | |
| matched_entity_id | UUID Nullable | |
| similarity_score | Decimal | |
| created_at | DateTime | |

### 7.3 `ai.voice_transcript`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| audio_url | URL | |
| transcript_text | Text | |
| language | String | |
| confidence | Decimal | |
| created_at | DateTime | |

### 7.4 `ai.embedding_index`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| entity_type | String | |
| entity_id | UUID | |
| title | String | |
| body | Text | |
| tags | JSON Array | |
| embedding_vector | Vector / Blob | OpenSearch / pgvector |
| indexed_at | DateTime | |

---

## 8. Feed Models

### 8.1 `social.feed_post`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| author_id | FK User / Org | |
| author_type | Enum | user, organization |
| post_type | Enum | product, weather, calendar, video, image, app, news, job_vacancy, thought |
| title | String | |
| body | Text | |
| content_json | JSON | Flexible payload |
| visibility | Enum | public, friends, private |
| location_lat | Decimal Nullable | |
| location_lng | Decimal Nullable | |
| weather_data_json | JSON Nullable | |
| calendar_event_json | JSON Nullable | |
| status | Enum | draft, published, archived |
| published_at | DateTime Nullable | |
| created_at | DateTime | |
| updated_at | DateTime | |

### 8.2 `social.feed_media`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| post_id | FK | |
| media_type | Enum | image, video, audio |
| url | URL | |
| thumbnail_url | URL | |
| duration_sec | Int Nullable | |
| sort_order | Int | |

### 8.3 `social.feed_product_link`

| Field | Type | Notes |
|-------|------|-------|
| post_id | FK | |
| product_id | FK commerce.product | |
| PK | (post_id, product_id) | |

### 8.4 `social.feed_engagement`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| post_id | FK | |
| user_id | FK | |
| type | Enum | like, comment, share, save |
| comment_text | Text Nullable | |
| created_at | DateTime | |

### 8.5 `social.weather_widget_cache`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| location_key | String | |
| data_json | JSON | |
| fetched_at | DateTime | |
| expires_at | DateTime | |

---

## 9. Media & Live Stream Models

### 9.1 `media.media_asset`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| owner_id | UUID | |
| owner_type | Enum | user, organization |
| media_type | Enum | video, audio, image, live_recording |
| title | String | |
| description | Text | |
| file_url | URL | |
| thumbnail_url | URL | |
| duration_sec | Int Nullable | |
| width | Int Nullable | |
| height | Int Nullable | |
| file_size | BigInt | |
| processing_status | Enum | uploading, processing, ready, failed |
| view_count | Int | |
| like_count | Int | |
| created_at | DateTime | |

### 9.2 `media.live_stream`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| host_id | FK User | |
| title | String | |
| description | Text | |
| thumbnail_url | URL | |
| stream_key | String | |
| webrtc_room_id | String | TikTok-like live |
| status | Enum | scheduled, live, ended |
| scheduled_at | DateTime Nullable | |
| started_at | DateTime Nullable | |
| ended_at | DateTime Nullable | |
| viewer_count_peak | Int | |
| recording_url | URL Nullable | |

### 9.3 `media.live_viewer`

| Field | Type | Notes |
|-------|------|-------|
| live_stream_id | FK | |
| user_id | FK | |
| joined_at | DateTime | |
| left_at | DateTime Nullable | |

### 9.4 `media.media_playlist`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| owner_id | FK | |
| title | String | |
| description | Text | |
| is_public | Boolean | |

### 9.5 `media.playlist_item`

| Field | Type | Notes |
|-------|------|-------|
| playlist_id | FK | |
| media_asset_id | FK | |
| sort_order | Int | |

---

## 10. Ecommerce & Seller Centre Models

### 10.1 `commerce.category`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| parent_id | FK Nullable | |
| name | String | |
| slug | String Unique | |
| image_url | URL | |
| sort_order | Int | |
| is_active | Boolean | |

### 10.2 `commerce.product`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| seller_org_id | FK Organization | |
| category_id | FK | |
| name | String | |
| slug | String | |
| description | Text | |
| condition | Enum | new, used, refurbished |
| brand_name | String | |
| model | String | |
| batch_no | String | |
| certified_no | String | |
| weight_kg | Decimal | |
| height_cm | Decimal | |
| length_cm | Decimal | |
| width_cm | Decimal | |
| ingredients | Text | |
| attributes_json | JSON | |
| how_where_used | Text | |
| whats_in_box | Text | |
| caution | Text | |
| product_video_url | URL | |
| price | Currency | |
| currency | String | Default NPR |
| retail_discount_pct | Decimal | |
| delivery_from_pay | Currency | |
| delivery_to_pay | Currency | |
| manufacture_date | Date Nullable | |
| expire_date | Date Nullable | |
| stock_qty | Decimal | |
| sku | String | |
| barcode | String | |
| plan_type | Enum | basic, super, dropshipper |
| status | Enum | draft, published, archived |
| created_at | DateTime | |
| updated_at | DateTime | |

### 10.3 `commerce.product_image`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| product_id | FK | |
| url | URL | |
| sort_order | Int | Max 6 photos |

### 10.4 `commerce.product_attribute`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| product_id | FK | |
| key | String | |
| value | String | |

### 10.5 `commerce.cart`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| user_id | FK | |
| updated_at | DateTime | |

### 10.6 `commerce.cart_item`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| cart_id | FK | |
| product_id | FK | |
| qty | Decimal | |
| unit_price | Currency | |

### 10.7 `commerce.order`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| order_no | String Unique | |
| buyer_user_id | FK | |
| seller_org_id | FK | |
| subtotal | Currency | |
| discount | Currency | |
| delivery_fee | Currency | |
| tax | Currency | |
| total | Currency | |
| payment_status | Enum | pending, paid, failed, refunded |
| order_status | Enum | placed, confirmed, packed, shipped, delivered, cancelled, returned |
| shipping_address_id | FK | |
| created_at | DateTime | |
| updated_at | DateTime | |

### 10.8 `commerce.order_item`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| order_id | FK | |
| product_id | FK | |
| qty | Decimal | |
| unit_price | Currency | |
| amount | Currency | |
| discount | Currency | |

### 10.9 `commerce.review`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| product_id | FK | |
| user_id | FK | |
| rating | Int | 1–5 |
| comment | Text | |
| created_at | DateTime | |

### 10.10 `commerce.pick_drop_request`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| user_id | FK | |
| pickup_address | Text | |
| drop_address | Text | |
| item_description | Text | |
| status | Enum | requested, assigned, in_transit, delivered, cancelled |
| assigned_driver_id | FK Nullable | |
| created_at | DateTime | |

### 10.11 `commerce.nearest_shop`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| org_id | FK Retailer | |
| name | String | |
| lat | Decimal | |
| lng | Decimal | |
| address | Text | |
| is_active | Boolean | |

---

## 11. Payment & Advertisement Models

### 11.1 `integration.payment_gateway`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| code | String Unique | e.g. esewa, khalti, bank |
| name | String | |
| config_json | JSON | Encrypted secrets |
| is_active | Boolean | |

### 11.2 `integration.payment_transaction`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| order_id | FK Nullable | |
| ad_campaign_id | FK Nullable | |
| gateway_id | FK | |
| external_txn_id | String | |
| amount | Currency | |
| currency | String | |
| status | Enum | pending, success, failed, refunded |
| payment_method | String | |
| metadata_json | JSON | |
| created_at | DateTime | |

### 11.3 `marketing.ad_plan`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| code | String | |
| name | String | |
| price | Currency | According to payment |
| duration_days | Int | |
| impressions_limit | Int | |
| features_json | JSON | |
| is_active | Boolean | |

### 11.4 `marketing.ad_campaign`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| advertiser_org_id | FK | |
| plan_id | FK | |
| title | String | |
| content_json | JSON | |
| target_audience_json | JSON | |
| budget | Currency | |
| spent | Currency | |
| payment_transaction_id | FK Nullable | |
| work_order_id | FK Nullable | Agency production WO (marketing template) |
| process_run_id | FK Nullable | |
| status | Enum | draft, active, paused, completed |
| start_at | DateTime | |
| end_at | DateTime | |

### 11.5 `marketing.ad_impression`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| campaign_id | FK | |
| user_id | FK Nullable | |
| post_id | FK Nullable | |
| viewed_at | DateTime | |
| clicked | Boolean | |

---

## 12. Documentation Models

### 12.1 `document.document`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| org_id | FK Nullable | |
| owner_id | FK | |
| doc_type | Enum | word, excel, powerpoint, blog, news, mou, agreement, minute, custom |
| title | String | |
| content_html | Text | |
| file_url | URL | |
| template_id | FK Nullable | |
| version | Int | |
| status | Enum | draft, published, archived |
| entity_type | String Nullable | e.g. work_order, process_run_stage, organization |
| entity_id | UUID Nullable | Polymorphic link to Process Engine / other domains |
| created_by | FK | |
| published_at | DateTime Nullable | |
| created_at | DateTime | |

### 12.2 `document.document_template`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| org_id | FK Nullable | Null = system template |
| name | String | |
| doc_type | Enum | mou, agreement, minute, custom, … |
| template_content | Text | |
| is_system_template | Boolean | |

### 12.3 `document.blog_post`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| author_id | FK | |
| title | String | |
| slug | String Unique | |
| excerpt | Text | |
| body | Text | |
| cover_image | URL | |
| tags | JSON Array | |
| status | Enum | draft, published, archived |
| published_at | DateTime Nullable | |

---

## 13. Customer Dashboard Models

### 13.1 `social.friendship`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| requester_id | FK User | |
| addressee_id | FK User | |
| status | Enum | pending, accepted, blocked |
| created_at | DateTime | |
| accepted_at | DateTime Nullable | |

### 13.2 `social.friend_suggestion`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| user_id | FK | |
| suggested_user_id | FK | |
| score | Decimal | |
| reason | String | |
| dismissed | Boolean | |

### 13.3 `social.online_presence`

| Field | Type | Notes |
|-------|------|-------|
| user_id | PK / FK | |
| is_online | Boolean | |
| last_seen_at | DateTime | |
| device_type | String | |

### 13.4 `social.thought_portal`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| user_id | FK | |
| content_type | Enum | photo, video |
| media_url | URL | |
| caption | Text | |
| created_at | DateTime | |

### 13.5 `social.live_market_session`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| seller_org_id | FK | |
| title | String | |
| live_stream_id | FK | |
| product_ids | JSON Array | |
| status | Enum | scheduled, live, ended |

### 13.6 `social.story`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| user_id | FK | |
| media_type | Enum | image, video |
| media_url | URL | |
| expires_at | DateTime | |
| view_count | Int | |
| created_at | DateTime | |

---

## 14. Chat Centre Models

### 14.1 `communication.chat_thread`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| thread_type | Enum | personal, store, product, story, personal_business, organization, help |
| title | String | |
| created_by | FK | |
| org_id | FK Nullable | |
| product_id | FK Nullable | |
| store_id | FK Nullable | |
| last_message_at | DateTime | |
| created_at | DateTime | |

### 14.2 `communication.chat_participant`

| Field | Type | Notes |
|-------|------|-------|
| thread_id | FK | |
| user_id | FK | |
| role | Enum | member, admin |
| joined_at | DateTime | |
| left_at | DateTime Nullable | |

### 14.3 `communication.chat_message`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| thread_id | FK | |
| sender_id | FK | |
| message_type | Enum | text, voice, image, video, file, call_log |
| body | Text | |
| media_url | URL Nullable | |
| voice_duration_sec | Int Nullable | |
| reply_to_id | FK Nullable | |
| is_read | Boolean | |
| created_at | DateTime | |

### 14.4 `communication.call_session`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| thread_id | FK | |
| caller_id | FK | |
| callee_id | FK | |
| call_type | Enum | audio, video |
| webrtc_session_id | String | |
| status | Enum | ringing, active, ended, missed |
| started_at | DateTime Nullable | |
| ended_at | DateTime Nullable | |
| duration_sec | Int Nullable | |

### 14.5 `communication.help_ticket`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| user_id | FK | |
| category | String | |
| subject | String | |
| description | Text | |
| thread_id | FK Nullable | |
| status | Enum | open, in_progress, resolved, closed |
| assigned_to | FK Nullable | |
| created_at | DateTime | |

---

## 15. HR & Administration Models

### 15.1 `hr.position_master`

| Field | Type | Notes |
|-------|------|-------|
| pos_id | PK Int | |
| designation | String | Job title |
| department | String | |
| min_edu | String | |
| experience | String | |
| reports_to | FK Int Nullable | Reporting position |

### 15.2 `hr.employee`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| org_id | FK | |
| user_id | FK Nullable | |
| employee_code | String | |
| full_name | String | |
| citizenship_no | String | |
| pan_no | String | |
| photo_url | URL | |
| classification | Enum | permanent, contract, temporary, daily, intern |
| grade | Enum | G1–G7 |
| department_id | FK | |
| position_id | FK | |
| reporting_to_id | FK Nullable | |
| join_date | Date | |
| probation_end | Date Nullable | |
| status | Enum | active, on_leave, suspended, exited |
| created_at | DateTime | |

### 15.3 `hr.job_vacancy`

| Field | Type | Notes |
|-------|------|-------|
| vacancy_id | PK | e.g. VAC-2026-01 |
| org_id | FK | |
| target_pos_id | FK | |
| title | String | |
| description | Text | |
| open_date | Date | |
| close_date | Date | |
| hiring_manager_id | FK Emp | |
| status | Enum | draft, active, closed, fulfilled |
| feed_post_id | FK Nullable | Social feed job ad |

### 15.4 `hr.job_applicant`

| Field | Type | Notes |
|-------|------|-------|
| app_id | PK | |
| vacancy_id | FK | |
| full_name | String | |
| phone | String | |
| email | String | |
| edu_doc_url | URL | |
| exp_years | Decimal | |
| cv_link | URL | |
| current_stage | Enum | applied, shortlisted, interviewed, rejected, hired |

### 15.5 `hr.selection_scoring`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| applicant_id | FK | |
| interviewer_id | FK Emp | |
| score | Int | 1–100 |
| remarks | String | |
| status | Enum | hired, waitlist, rejected |

### 15.6 `hr.onboarding_process`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| employee_id | FK | |
| offer_letter_url | URL | |
| joined_date | Date | |
| probation_period_months | Int | |
| gurukul_status | String / FK | |

### 15.7 `hr.employee_onboarding_task`

| Field | Type | Notes |
|-------|------|-------|
| task_id | PK | |
| emp_id | FK | |
| task_name | String | e.g. SOP Reading |
| due_date | Date | |
| is_completed | Boolean | |
| manager_remark | String | |

### 15.8 `hr.training_log`

| Field | Type | Notes |
|-------|------|-------|
| log_id | PK | |
| emp_id | FK | |
| module_name | String | |
| watch_time | Duration | |
| exam_score | Int | Min 80 |
| completion_date | Date | |

### 15.9 `hr.attendance`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| employee_id | FK | |
| date | Date | |
| shift | Enum | A, B, C |
| check_in | DateTime | |
| check_out | DateTime Nullable | |
| ot_hours | Decimal | |
| status | Enum | present, absent, half_day, leave |

### 15.10 `hr.leave_request`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| employee_id | FK | |
| leave_type | Enum | casual, sick, festival, maternity, paternity |
| from_date | Date | |
| to_date | Date | |
| reason | Text | |
| approval_status | Enum | pending, approved, rejected |
| approved_by | FK Nullable | |

### 15.11 `hr.payroll_run`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| period_month | String | YYYY-MM |
| status | Enum | draft, processed, approved, paid |
| processed_at | DateTime Nullable | |
| approved_by | FK Nullable | |

### 15.12 `hr.payroll_line`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| payroll_run_id | FK | |
| employee_id | FK | |
| basic | Currency | |
| allowances | Currency | |
| deductions | Currency | |
| ot_amount | Currency | |
| net_pay | Currency | |

---

## 16. Finance & Accounts Models

### 16.1 `finance.chart_of_account`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| code | String | Assets 1000, Liabilities 2000, Equity 3000, Revenue 4000, COGS 5000, OpEx 6000 |
| name | String | |
| head_type | Enum | asset, liability, equity, revenue, cogs, expense |
| parent_id | FK Nullable | |
| is_active | Boolean | |

### 16.2 `finance.journal_voucher`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| voucher_no | String | |
| voucher_type | Enum | journal, payment, receipt, contra |
| date | Date | |
| narration | Text | |
| total_debit | Currency | |
| total_credit | Currency | |
| status | Enum | draft, verified, posted |
| created_by | FK | |

### 16.3 `finance.journal_line`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| voucher_id | FK | |
| account_id | FK | |
| debit | Currency | |
| credit | Currency | |
| party_id | FK Nullable | |
| reference | String | |

### 16.4 `finance.purchase`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| purchase_no | String | |
| supplier_id | FK | |
| date | Date | |
| subtotal | Currency | |
| tax | Currency | |
| total | Currency | |
| status | Enum | |
| payment_status | Enum | unpaid, partial, paid |

### 16.5 `finance.purchase_order`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| po_no | String | |
| supplier_id | FK | |
| date | Date | |
| delivery_date | Date | |
| total | Currency | |
| status | Enum | draft, approved, sent, closed, cancelled |
| approved_by | FK Nullable | |

### 16.6 `finance.purchase_order_line`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| po_id | FK | |
| item_id | FK | |
| qty | Decimal | |
| rate | Currency | |
| amount | Currency | |

### 16.7 `finance.purchase_payment`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| purchase_id | FK | |
| amount | Currency | |
| payment_mode | Enum | cash, bank, cheque, gateway |
| bank_account_id | FK Nullable | |
| date | Date | |
| reference | String | |

### 16.8 `finance.debit_note`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| purchase_id | FK | |
| amount | Currency | |
| reason | Text | |
| date | Date | |
| status | Enum | |

### 16.9 `finance.sales`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| sales_no | String | |
| party_id | FK | |
| date | Date | |
| subtotal | Currency | |
| discount | Currency | |
| tax | Currency | |
| total | Currency | |
| status | Enum | |

### 16.10 `finance.sales_order`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| so_no | String | |
| party_id | FK | |
| date | Date | |
| total | Currency | |
| status | Enum | |

### 16.11 `finance.sales_order_line`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| so_id | FK | |
| product_id | FK | |
| qty | Decimal | |
| price | Currency | |
| amount | Currency | |
| discount | Currency | |

### 16.12 `finance.sales_received`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| sales_id | FK | |
| amount | Currency | |
| payment_mode | Enum | |
| date | Date | |
| reference | String | |

### 16.13 `finance.credit_note`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| sales_id | FK | |
| amount | Currency | |
| reason | Text | |
| date | Date | |
| status | Enum | |

### 16.14 `finance.cash_bank_account`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| name | String | |
| account_type | Enum | cash, bank |
| opening_balance | Currency | |
| current_balance | Currency | |

### 16.15 `finance.day_book`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| date | Date | |
| account_id | FK | |
| debit | Currency | |
| credit | Currency | |
| narration | Text | |
| voucher_id | FK Nullable | |

### 16.16 `finance.ledger`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| party_id | FK Nullable | |
| account_id | FK | |
| date | Date | |
| debit | Currency | |
| credit | Currency | |
| balance | Currency | |
| reference | String | |

### 16.17 `finance.income_expense`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| type | Enum | income, expense |
| category | String | |
| amount | Currency | |
| date | Date | |
| description | Text | |
| voucher_id | FK Nullable | |

### 16.18 `finance.profit_loss_snapshot`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| period_from | Date | |
| period_to | Date | |
| revenue | Currency | |
| cogs | Currency | |
| expenses | Currency | |
| net_profit | Currency | |
| generated_at | DateTime | |

### 16.19 `finance.tax_audit_record`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| tax_type | Enum | vat, tds, income |
| period | String | |
| amount | Currency | |
| filing_status | Enum | draft, filed, audited |
| filed_at | DateTime Nullable | |

### 16.20 `finance.action_plan`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| title | String | |
| objective | Text | |
| start_date | Date | |
| end_date | Date | |
| owner_id | FK | |
| status | Enum | planned, in_progress, completed |
| tasks_json | JSON | |

### 16.21 `finance.issue_cheque`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| cheque_no | String | |
| bank_account_id | FK | |
| payee | String | |
| amount | Currency | |
| date | Date | |
| status | Enum | issued, cleared, bounced |

### 16.22 Purchase requisition / RFQ (Procurement)

#### `purchase.purchase_requisition`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| pr_no | String | |
| date | Date | |
| department_id | FK | |
| status | Enum | |
| requested_by | FK | |

#### `purchase.purchase_requisition_line`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| pr_id | FK | |
| item_code | String | |
| material_id | FK | |
| qty | Decimal | |
| required_date | Date | |

#### `purchase.rfq`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| rfq_no | String | |
| supplier_id | FK | |
| item_id | FK | |
| qty | Decimal | |
| unit_price | Currency | |
| delivery_days | Int | |
| payment_terms | Text | |
| remarks | Text | |

#### `purchase.vendor`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| vendor_name | String | |
| contact | String | |
| category | String | |
| quality_rating | Int | |
| delivery_rating | Int | |
| overall_score | Int | |
| pan_vat | String | |
| status | Enum | |

---

## 17. Process Engine & Production Models

**Design rule:** One universal Process Engine for every industry. Factory-specific names (mixing, packaging, refine) are **stage labels / template defaults**, not core tables.

```
Industry Template Pack (optional)
        ↓ install / copy
Process Definition  →  Process Stages  →  Stage Field Specs
        ↓ instantiate
Work Order  →  Process Run  →  Process Run Stages  →  Process Run Lines
        ↓ links to
Inventory | Finance | HR | Quality | Documents | Analytics
```

### 17.0 Capability flags (per org)

| Capability code | When enabled | Models used |
|-----------------|--------------|-------------|
| `process_engine` | Any company that does staged work | definition, stage, work_order, run, run_stage, run_line |
| `bom` | Manufacturing / food / chocolate | bom, bom_line |
| `batch` | Batch-tracked goods | batch |
| `warehouse` | Stock in/out from process | inventory.* via run_line |
| `qc` | Inspections on stages | quality.* via run_stage_id |
| `recipe` | Formula industries | recipe (optional alias of BOM) |

Disable `process_engine` entirely for pure trading orgs (distributor/retailer with purchase+sales only).

---

### 17.1 `production.industry_template`

System starter packs. Copied into an org on setup; org then customizes freely.

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| code | String Unique | fmcg_food, chocolate, software, construction, marketing, generic |
| name | String | |
| description | Text | |
| default_capabilities | JSON Array | e.g. bom, batch, warehouse, qc |
| default_stages_json | JSON | Ordered stage definitions |
| default_fields_json | JSON | Field specs per stage |
| is_system | Boolean | True for platform packs |
| is_active | Boolean | |

#### Built-in template examples

| Template | Default stages (UI labels) | Typical capabilities |
|----------|----------------------------|----------------------|
| `fmcg_food` | Process → Refine → Mix → Package | bom, batch, warehouse, qc |
| `chocolate` | Roast → Conche → Temper → Mold → Pack | bom, batch, warehouse, qc, recipe |
| `software` | Backlog → Design → Development → QA → Release | process_engine, documents (no bom/batch) |
| `construction` | Excavation → Foundation → Structure → MEP → Finishing → Handover | process_engine, warehouse, qc |
| `marketing` | Brief → Concept → Creative → Approval → Publish → Report | process_engine, media, ads |
| `generic` | Stage 1 → Stage 2 (blank) | process_engine only |

Legacy factory screens map as:

| Old hardcoded model | Now |
|---------------------|-----|
| `processing_job` / `processing_item` / `processing_refine` | `process_run` + `process_run_stage` + `process_run_line` (line_type=input/output/wastage/refine) |
| `mixing_row` | Stage with label “Mixing” + run_stage qty fields |
| `packaging_job` | Stage with label “Packaging” + optional `parent_run_stage_id` |

---

### 17.2 `production.process_definition`

Named process for one organization (customizable).

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| org_id | FK Organization | |
| industry_template_id | FK Nullable | Source pack if installed from template |
| code | String | Org-unique |
| name | String | e.g. “Dark Chocolate Bar Line”, “Website Delivery”, “Tower A” |
| description | Text | |
| output_type | Enum | product, deliverable, campaign, project, service, other |
| default_output_item_id | FK inventory.item_master Nullable | Finished good / SKU when warehouse enabled |
| form_metadata_id | FK core.metadata_form Nullable | Runtime form for this process |
| workflow_definition_id | FK Nullable | Approval workflow for WO create/complete |
| version | Int | |
| status | Enum | draft, active, archived |
| created_by | FK | |
| created_at | DateTime | |
| updated_at | DateTime | |

---

### 17.3 `production.process_stage`

Ordered steps inside a process definition. **Company customizes these.**

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| process_definition_id | FK | |
| code | String | e.g. mix, package, qa_release, foundation |
| name | String | Display label (Mixing Row, Packaging, Development…) |
| sort_order | Int | |
| stage_type | Enum | transform, assemble, inspect, package, approve, deliver, custom |
| is_optional | Boolean | |
| requires_previous_complete | Boolean | Gate to prior stage |
| allow_parallel | Boolean | |
| default_assignee_role | String Nullable | |
| sla_hours | Int Nullable | |
| ui_config_json | JSON | Icons, colors, dashboard widget hints |
| created_at | DateTime | |

---

### 17.4 `production.process_stage_field`

Custom fields per stage (metadata — replaces hardcoding wastage_name, temperature, PR_link, etc.).

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| process_stage_id | FK | |
| field_key | String | e.g. wastage_name, temperature, story_points, area_sqm |
| label | String | |
| field_type | Enum | text, number, currency, date, datetime, boolean, dropdown, multi_select, file, image, gps, barcode, rich_text |
| is_required | Boolean | |
| options_json | JSON Nullable | For dropdowns |
| validation_json | JSON Nullable | min/max, regex |
| default_value | String Nullable | |
| sort_order | Int | |
| show_on_dashboard | Boolean | |

---

### 17.5 `production.work_order`

A job instance for any industry (“Produce 5000 jars”, “Build feature X”, “Complete floor 3”, “Campaign Q3”).

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| org_id | FK | |
| process_definition_id | FK | |
| wo_no | String | Unique per org |
| title | String | |
| product_id | FK commerce.product / item Nullable | Output product when applicable |
| output_item_id | FK inventory.item_master Nullable | |
| batch_id | FK Nullable | If batch capability on |
| bom_id | FK Nullable | If bom capability on |
| target_qty | Decimal Nullable | Quantity-based industries |
| actual_qty | Decimal Nullable | |
| waste_qty | Decimal Nullable | Rolled up from run lines |
| uom | String Nullable | |
| priority | Enum | low, medium, high, critical |
| planned_start | DateTime Nullable | |
| planned_end | DateTime Nullable | |
| department_id | FK Nullable | |
| supervisor_id | FK Employee Nullable | |
| customer_party_id | FK sales.party Nullable | Construction / services / marketing client |
| project_code | String Nullable | Construction / software project key |
| status | Enum | draft, released, in_progress, on_hold, completed, cancelled |
| date | Date | |
| custom_data_json | JSON | WO-level custom fields |
| created_by | FK | |
| created_at | DateTime | |
| updated_at | DateTime | |

---

### 17.6 `production.process_run`

One execution of a work order through the process definition.

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| org_id | FK | |
| work_order_id | FK | |
| process_definition_id | FK | Snapshot link |
| run_no | String | |
| started_at | DateTime Nullable | |
| completed_at | DateTime Nullable | |
| status | Enum | pending, in_progress, completed, aborted |
| notes | Text | |
| created_at | DateTime | |

---

### 17.7 `production.process_run_stage`

Actual data for one stage of a run. Replaces dedicated mixing/packaging/processing job tables.

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| process_run_id | FK | |
| process_stage_id | FK | Definition stage |
| parent_run_stage_id | FK Nullable | e.g. Packaging after Mixing |
| member_id | FK Employee Nullable | Operator / assignee |
| team_id | FK Nullable | |
| row_ref | String Nullable | Legacy “row_no” / line / station |
| goal_qty | Decimal Nullable | |
| total_qty | Decimal Nullable | |
| actual_qty | Decimal Nullable | |
| status | Enum | pending, in_progress, completed, skipped, failed |
| started_at | DateTime Nullable | |
| completed_at | DateTime Nullable | |
| custom_data_json | JSON | Values for stage fields (key → value) |
| sort_order | Int | Copied from stage at start |
| created_at | DateTime | |
| updated_at | DateTime | |

`custom_data_json` example (factory mix stage):

```json
{ "wastage_name": "Trim", "wastage_qty": 2.5, "temperature": 85 }
```

Software QA stage:

```json
{ "story_points": 5, "pr_link": "https://…", "bugs_found": 2 }
```

Construction structure stage:

```json
{ "area_sqm": 420, "inspection_status": "pass", "photo_evidence": ["url1"] }
```

---

### 17.8 `production.process_run_line`

Generic inputs / outputs / wastage / refine / resources / deliverables for a stage.

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| process_run_stage_id | FK | |
| line_type | Enum | input, output, wastage, refine, resource, deliverable, consumable |
| item_id | FK inventory.item_master Nullable | When stock-linked |
| item_name | String Nullable | Free-text when no item master |
| qty | Decimal | |
| uom | String Nullable | |
| from_warehouse_id | FK Nullable | Inputs / consumables |
| to_warehouse_id | FK Nullable | Outputs |
| stock_ledger_id | FK Nullable | Created inventory movement |
| refine_input_qty | Decimal Nullable | Refine pattern |
| refine_output_qty | Decimal Nullable | |
| refine_loss_qty | Decimal Nullable | |
| notes | Text | |
| sort_order | Int | |

**Inventory relation:** On complete stage, lines with `item_id` + warehouse create `inventory.stock_ledger` rows (`reference_type = process_run_line`, `reference_id = line.id`).

**Finance relation:** Costing aggregates run lines + labor into `production.production_costing` / journal via `work_order_id`.

---

### 17.9 `production.process_field_value` (optional normalized EAV)

Use when querying/filtering custom fields in SQL is required; otherwise `custom_data_json` on run_stage is enough.

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| process_run_stage_id | FK | |
| process_stage_field_id | FK | |
| value_text | Text Nullable | |
| value_number | Decimal Nullable | |
| value_bool | Boolean Nullable | |
| value_date | DateTime Nullable | |
| value_json | JSON Nullable | |

---

### 17.10 `production.batch` (optional capability: `batch`)

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| org_id | FK | |
| batch_no | String | e.g. SUN-{PRODUCT}-{YEAR}-{SEQ} |
| product_id | FK Nullable | |
| output_item_id | FK Nullable | |
| work_order_id | FK Nullable | |
| batch_size | Decimal | |
| start_date | Date | |
| end_date | Date Nullable | |
| manufacture_date | Date Nullable | |
| expire_date | Date Nullable | |
| supervisor_id | FK Nullable | |
| status | Enum | planned, active, closed, quarantined |
| created_at | DateTime | |

---

### 17.11 `production.bom` (optional capability: `bom`)

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| org_id | FK | |
| code | String | |
| name | String | |
| finished_product_id | FK Nullable | |
| finished_item_id | FK inventory.item_master | |
| version | Int | |
| status | Enum | draft, approved, obsolete |
| effective_from | Date Nullable | |
| created_at | DateTime | |

### 17.12 `production.bom_line`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| bom_id | FK | |
| raw_material_id | FK inventory.item_master | |
| qty_per_unit | Decimal | |
| uom | String | |
| scrap_pct | Decimal Nullable | |
| sort_order | Int | |
| remarks | Text | |

---

### 17.13 `production.working_report`

Cross-industry daily activity log (factory, site, agency, IT).

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| org_id | FK | |
| employee_id | FK | |
| work_order_id | FK Nullable | |
| process_run_stage_id | FK Nullable | |
| date | Date | |
| activities_json | JSON | |
| hours | Decimal | |
| remarks | Text | |
| created_at | DateTime | |

---

### 17.14 `production.damage_expire`

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| org_id | FK | |
| product_id | FK Nullable | |
| item_id | FK Nullable | |
| batch_id | FK Nullable | |
| work_order_id | FK Nullable | |
| process_run_line_id | FK Nullable | |
| qty | Decimal | |
| reason | Enum | damage, expire, scrap, other |
| date | Date | |
| approved_by | FK Nullable | |
| stock_ledger_id | FK Nullable | Inventory adjustment link |

---

### 17.15 `production.register_book`

Generic operational register (qty movements tied to process or free entry).

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| org_id | FK | |
| entry_date | Date | |
| entry_type | String | |
| reference_type | String Nullable | work_order, process_run, manual |
| reference_id | UUID Nullable | |
| reference_no | String | |
| description | Text | |
| qty | Decimal | |
| balance | Decimal | |

---

### 17.16 `production.material_issue_link` / raw material issue

Prefer `inventory.material_issue` with `work_order_id` + optional `process_run_id`. Kept here as production-facing view fields:

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| org_id | FK | |
| date | Date | |
| work_order_id | FK | |
| process_run_id | FK Nullable | |
| process_run_stage_id | FK Nullable | |
| material_id | FK inventory.item_master | |
| required_qty | Decimal | |
| issued_qty | Decimal | |
| balance | Decimal | |
| warehouse_id | FK | |
| store_approval | Boolean | |
| stock_ledger_id | FK Nullable | |

---

### 17.17 `production.wip_tracking`

Derived or stored WIP by process stage (works for factory WIP or construction % complete).

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| org_id | FK | |
| date | Date | |
| work_order_id | FK Nullable | |
| process_stage_id | FK | |
| opening_wip | Decimal | |
| input_qty | Decimal | |
| output_qty | Decimal | |
| closing_wip | Decimal | |

---

### 17.18 `production.production_costing`

Links process execution to finance for any industry (unit cost, project cost, campaign cost).

| Field | Type | Notes |
|-------|------|-------|
| id | PK UUID | |
| org_id | FK | |
| work_order_id | FK | |
| process_run_id | FK Nullable | |
| product_id | FK Nullable | |
| item_id | FK Nullable | |
| material_cost | Currency | From input/consumable lines |
| labor_cost | Currency | From working_report / HR |
| machine_cost | Currency | From maintenance / resource lines |
| overhead_cost | Currency | |
| total_cost | Currency | |
| per_unit_cost | Currency Nullable | |
| journal_voucher_id | FK finance.journal_voucher Nullable | Posted cost entry |
| period_date | Date | |
| created_at | DateTime | |

---

### 17.19 Cross-module relation map (Process Engine)

| Related domain | FK / link | Behavior |
|----------------|-----------|----------|
| **Organization** | `process_definition.org_id`, `industry_template_code` | Template install + capability flags |
| **HR** | `process_run_stage.member_id`, `working_report.employee_id` | Labor & attendance |
| **Inventory** | `process_run_line.item_id` → `stock_ledger` | Issue inputs / receive outputs |
| **Finance** | `production_costing.work_order_id` → vouchers | Costing, P&L |
| **Quality** | `quality.*.process_run_stage_id` | Stage inspections |
| **Documents** | `document` linked by `entity_type=process_run_stage` | Photos, drawings, SOPs |
| **Workflow / Task** | WO / stage status changes | Approvals, missions |
| **CRM / Sales** | `work_order.customer_party_id` | Client projects / campaigns |
| **Marketing** | Marketing template stages + `ad_campaign` optional link in custom_data | Agency work |
| **Maintenance** | Resource lines / machine_cost | Equipment used on stage |
| **Analytics** | KPI by `process_stage.code` + qty/cost | Industry-neutral dashboards |
| **Ecommerce** | `work_order.product_id` → published stock | Sell finished goods |

---

### 17.20 Org setup flow

```
1. Create organization
2. Select industry_template (or generic)
3. System copies template → process_definition + process_stages + process_stage_fields
4. Enable/disable capabilities (bom, batch, warehouse, qc)
5. Admin renames stages, adds/removes fields, binds forms & workflows
6. Users create work_orders → process_runs → fill run_stages / run_lines
7. Inventory / finance / QC hooks fire from the same IDs
```

---

## 18. Store & Inventory Models

### 18.1 `inventory.warehouse`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| name | String | |
| code | String | |
| address | Text | |
| type | Enum | raw, finished, spare, packaging |

### 18.2 `inventory.item_master`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| item_code | String | RM-, PM-, FG-, SP- |
| name | String | |
| category | Enum | raw, packaging, finished, spare |
| uom | String | |
| min_stock | Decimal | |
| max_stock | Decimal | |
| reorder_level | Decimal | |
| bin_location | String | |
| supplier_id | FK Nullable | |

### 18.3 `inventory.stock_ledger`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| item_id | FK | |
| warehouse_id | FK | |
| date | Date | |
| transaction_type | Enum | in, out, adjust |
| reference_type | String | grn, material_issue, process_run_line, sales_dispatch, damage_expire, manual |
| reference_id | UUID | e.g. process_run_line.id |
| work_order_id | FK Nullable | Process Engine link |
| process_run_id | FK Nullable | |
| opening_qty | Decimal | |
| in_qty | Decimal | |
| out_qty | Decimal | |
| closing_qty | Decimal | |

### 18.4 `inventory.grn`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| grn_no | String | |
| po_id | FK | |
| supplier_id | FK | |
| date | Date | |
| qc_status | Enum | pending, pass, fail, partial |
| received_by | FK | |
| status | Enum | |

### 18.5 `inventory.grn_line`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| grn_id | FK | |
| item_id | FK | |
| ordered_qty | Decimal | |
| received_qty | Decimal | |
| accepted_qty | Decimal | |
| rejected_qty | Decimal | |

### 18.6 `inventory.material_issue`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| issue_no | String | |
| work_order_id | FK Nullable | Process Engine work order |
| process_run_id | FK Nullable | |
| process_run_stage_id | FK Nullable | Stage that consumed material |
| date | Date | |
| issued_by | FK | |
| warehouse_id | FK | |
| status | Enum | |

### 18.7 `inventory.material_issue_line`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| issue_id | FK | |
| material_id | FK | |
| required_qty | Decimal | |
| issued_qty | Decimal | |

### 18.8 `inventory.stock_adjustment`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| item_id | FK | |
| warehouse_id | FK | |
| system_qty | Decimal | |
| physical_qty | Decimal | |
| variance | Decimal | |
| reason | Text | |
| date | Date | |
| approved_by | FK Nullable | |

---

## 19. Sales, Logistics & Distribution Models

### 19.1 `sales.party`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| name | String | |
| party_type | Enum | dealer, retailer, institutional, consumer_b2b |
| area | String | |
| asm_id | FK Nullable | |
| credit_limit | Currency | |
| status | Enum | active, inactive |

### 19.2 `sales.territory`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| name | String | Kathmandu Valley, Purwanchal, … |
| region | String | |
| asm_id | FK Nullable | |

### 19.3 `sales.asm_order` (Area Sales Manager)

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| party_id | FK | |
| asm_id | FK | |
| date | Date | |
| product_id | FK | |
| unit | String | |
| qty | Decimal | |
| price | Currency | |
| amount | Currency | |
| status | Enum | |

### 19.4 `sales.dealer_sales_order` (Dealer Sales Manager)

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| party_id | FK | |
| dsm_id | FK | |
| date | Date | |
| discount | Currency | |
| total | Currency | |
| status | Enum | |

### 19.5 `sales.dealer_sales_line`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| order_id | FK | |
| product_id | FK | |
| barcode | String | |
| unit | String | |
| qty | Decimal | |
| price | Currency | |
| amount | Currency | |
| discount | Currency | |

### 19.6 `sales.retail_sales_order` (Retail Sales Manager)

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| party_id | FK | |
| rsm_id | FK | |
| dealer_order_id | FK Nullable | |
| date | Date | |
| discount | Currency | |
| total | Currency | |
| status | Enum | |

### 19.7 `sales.retail_sales_line`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| order_id | FK | |
| product_id | FK | |
| barcode | String | |
| unit | String | |
| qty | Decimal | |
| price | Currency | |
| amount | Currency | |
| discount | Currency | |

### 19.8 `sales.return_order`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| original_order_id | UUID | |
| party_id | FK | |
| reason | Text | |
| total | Currency | |
| status | Enum | |

### 19.9 `sales.promotion_scheme`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| name | String | |
| code | String | |
| budget | Currency | |
| start_date | Date | |
| end_date | Date | |
| status | Enum | |

### 19.10 `logistics.vehicle`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| number | String | |
| capacity | Decimal | |
| insurance_expiry | Date | |
| fitness_expiry | Date | |
| tax_expiry | Date Nullable | |

### 19.11 `logistics.route`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| name | String | |
| territory_id | FK Nullable | |
| sequence_json | JSON | |

### 19.12 `logistics.dispatch`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| sales_order_id | FK | |
| vehicle_id | FK | |
| driver_id | FK | |
| route_id | FK Nullable | |
| status | Enum | planned, loaded, dispatched, delivered, cancelled |
| dispatched_at | DateTime Nullable | |
| delivered_at | DateTime Nullable | |

### 19.13 `logistics.pod`

| Field | Type | Notes |
|-------|------|-------|
| dispatch_id | PK / FK | |
| signature_url | URL | Mandatory |
| photo_url | URL | |
| received_by | String | |
| delivered_at | DateTime | |

---

## 20. Quality (QA/QC) Models

QC attaches to Process Engine stages when capability `qc` is enabled. Works for factory IPQC, construction inspections, software QA gates, etc.

### 20.1 `quality.incoming_inspection`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| inspection_no | String | |
| date | Date | |
| supplier_id | FK | |
| material_id | FK | |
| batch_id | FK Nullable | |
| batch_no | String | |
| grn_line_id | FK Nullable | |
| parameter | String | |
| result | String | |
| status | Enum | pass, fail, hold |
| inspector_id | FK | |

### 20.2 `quality.in_process_qc`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| date | Date | |
| product_id | FK Nullable | |
| batch_id | FK Nullable | |
| batch_no | String | |
| work_order_id | FK Nullable | Process Engine |
| process_run_id | FK Nullable | |
| process_run_stage_id | FK Nullable | Preferred link to stage under inspection |
| process_stage_id | FK Nullable | Definition stage |
| process_step | String | Display label (legacy / denormalized) |
| parameter | String | |
| standard | String | |
| actual | String | |
| status | Enum | |
| inspector_id | FK | |

### 20.3 `quality.final_qa_release`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| batch_no | String | |
| batch_id | FK Nullable | |
| product_id | FK Nullable | |
| work_order_id | FK Nullable | |
| process_run_id | FK Nullable | |
| process_run_stage_id | FK Nullable | Final/release stage |
| inspection_date | Date | |
| quantity | Decimal | |
| quality_status | Enum | |
| release_status | Enum | released, held, rejected |
| approved_by | FK | |

### 20.4 `quality.lab_report`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| test_no | String | |
| sample | String | |
| work_order_id | FK Nullable | |
| process_run_stage_id | FK Nullable | |
| batch_id | FK Nullable | |
| test_parameter | String | |
| method | String | |
| specification | String | |
| result | String | |
| unit | String | |
| status | Enum | |

### 20.5 `quality.ncr`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| ncr_no | String | |
| date | Date | |
| issue | Text | |
| department_id | FK | |
| work_order_id | FK Nullable | |
| process_run_stage_id | FK Nullable | |
| root_cause | Text | |
| correction | Text | |
| status | Enum | |

### 20.6 `quality.capa`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| capa_no | String | |
| problem | Text | |
| root_cause | Text | |
| corrective_action | Text | |
| preventive_action | Text | |
| owner_id | FK | |
| due_date | Date | |
| ncr_id | FK Nullable | |
| work_order_id | FK Nullable | |
| status | Enum | open, closed |

### 20.7 `quality.quality_master`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| product_id | FK Nullable | |
| process_definition_id | FK Nullable | Specs per custom process |
| process_stage_id | FK Nullable | Specs per stage |
| quality_parameter | String | |
| specification | String | |
| tolerance | String | |
| testing_frequency | String | |

---

## 21. CRM Models

### 21.1 `crm.complaint`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| customer_id | FK | |
| product_id | FK Nullable | |
| description | Text | |
| status | Enum | registered, investigating, capa, closed |
| registered_at | DateTime | |
| closed_at | DateTime Nullable | |
| sla_hours | Int | Target ≤48 |

### 21.2 `crm.pipeline_deal`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| party_id | FK | |
| title | String | |
| stage | Enum | lead, qualified, proposal, negotiation, won, lost |
| value | Currency | |
| owner_id | FK | |
| expected_close | Date | |
| work_order_id | FK Nullable | Optional delivery WO after deal won |

### 21.3 `crm.customer_activity`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| party_id | FK | |
| activity_type | Enum | call, visit, email, follow_up |
| notes | Text | |
| performed_by | FK | |
| performed_at | DateTime | |

---

## 22. Maintenance Models

### 22.1 `maintenance.equipment`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| asset_code | String | |
| name | String | |
| location | String | |
| capacity | String | |
| category | Enum | A, B, C |
| health_index | Enum | green, yellow, red |
| purchase_date | Date Nullable | |

### 22.2 `maintenance.work_order`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| equipment_id | FK | |
| type | Enum | preventive, breakdown, predictive |
| description | Text | |
| technician_id | FK Nullable | |
| status | Enum | requested, approved, in_progress, closed |
| requested_at | DateTime | |
| closed_at | DateTime Nullable | |

### 22.3 `maintenance.pm_schedule`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| equipment_id | FK | |
| frequency | Enum | daily, weekly, monthly, quarterly, annual |
| activity | String | |
| next_due | Date | |
| last_done | Date Nullable | |

### 22.4 `maintenance.calibration`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| equipment_id | FK | |
| calibrated_at | Date | |
| next_due | Date | |
| result | Enum | pass, fail |
| performed_by | FK | |

---

## 23. Analytics & Dashboard Models

### 23.1 `analytics.dashboard_widget`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| workspace_type | Enum | executive, manufacture, operations, software, construction, marketing, distributor, retail, processing, consumer, seller, … |
| role | String | |
| widget_code | String | |
| query_config_json | JSON | |
| sort_order | Int | |

### 23.2 `analytics.kpi_snapshot`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK | |
| kpi_code | String | |
| target | Decimal | |
| actual | Decimal | |
| achievement_pct | Decimal | |
| period_date | Date | |

### 23.3 `analytics.report_definition`

| Field | Type | Notes |
|-------|------|-------|
| id | PK | |
| org_id | FK Nullable | |
| name | String | |
| domain | String | |
| fields_json | JSON | |
| filters_json | JSON | |
| created_by | FK | |

---

## 24. Role Dashboard Map

Dashboards are **workspaces** over shared models, filtered by `account_type`, `industry_template`, and enabled capabilities — not separate databases.

| Dashboard | Account / Template | Primary Models |
|-----------|--------------------|----------------|
| **Customer Dashboard** | consumer | profile, friendship, nearest_shop, feed, thought_portal, live_market, blog, media |
| **Seller Centre** | any seller org | commerce.product, product_image, order |
| **Manufacture Dashboard** | manufacture / fmcg_food / chocolate | purchase, sales, work_order, process_run*, inventory, finance, team, meeting |
| **Processing / Operations Dashboard** | any org with `process_engine` | process_definition, process_stage, work_order, process_run, process_run_stage, process_run_line |
| **Software Delivery Workspace** | software template | work_order, process_run_stage (Design→Release), documents, working_report |
| **Construction Project Workspace** | construction template | work_order, process_run_stage (site stages), material_issue, quality, documents |
| **Marketing Production Workspace** | marketing template | work_order, process_run_stage, ad_campaign, media, crm.pipeline_deal |
| **Marketing & Sales (ASM/DSM/RSM)** | sales roles | asm_order, dealer_sales_order, retail_sales_order, party |
| **Distributor Dashboard** | distributor | purchase, sales, stock, finance subset, retailer, team |
| **Retail Dashboard** | retailer | purchase, sales, stock, finance subset, nearest_consumer, team |
| **Whole Company System** | HQ | all analytics + executive KPIs |
| **Chat Centre** | all | chat_thread, chat_message, call_session, help_ticket, story |

### Manufacture / Operations menu (models)

Purchase, Purchase Order, Payment, Dr Note, Sales, Sales Order, Received, Cr Note, Action Plan, Working Report, **Process Runs / Stages** (formerly Mixing/Packaging/Processing), Stock Product, Cash/Bank Amount, Debit, Damage/Expire, Register Book, Ledger, Day Book, Income/Expenses, Profit/Loss, Analytic/Report, Meeting, Team, Distributor

UI labels for stages still come from `process_stage.name` (e.g. “Mixing Row”, “Packaging”) so factory users keep familiar language.

### Distributor Dashboard menu (models)

Purchase, Purchase Order, Payment, Dr Note, Sales, Sales Order, Received, Cr Note, Stock, Product, Damage/Expire, Issue Cheque, Cash/Bank Amount, Debit, Credit, Register Book, Ledger, Day Book, Income/Expenses, Profit/Loss, Analytic/Report, Meeting, Retailer, Team

### Retail Dashboard menu (models)

Purchase, Purchase Order, Payment, Dr Note, Sales, Sales Order, Received, Cr Note, Stock Product, Damage/Expire, Issue Cheque, Cash/Bank Amount, Debit, Credit, Register Book, Ledger, Day Book, Income/Expenses, Profit/Loss, Analytic Report, Meeting, Nearest Consumer, Team

---

## 25. Services → Capability → Models Map

| Service Area | Capabilities | Primary Models |
|--------------|--------------|----------------|
| **Administration** | User, Master, Report & Analyze, Meeting | identity.user, organization.*, hr.*, analytics.*, organization.meeting |
| **Finance** | Transaction, Procurement, Financial Planning | finance.*, purchase.*, inventory (valuation), production_costing |
| **Operations / Manufacturing** | Process Engine, QC, Distribution, Warehouse | production.process_*, work_order, quality.*, logistics.*, inventory.* |
| **Marketing & Sales** | Ads, Return & Order, CRM, Pipeline | marketing.*, sales.*, crm.*, commerce.*, work_order (agency) |
| **IT & Communication** | System & App Mgmt, R&D, Documentation & Compliance | core.metadata_form, document.*, communication.*, hr.training_log |

### Organization module features → models

| Feature | Models |
|---------|--------|
| Create organization | organization.organization, org_user |
| Choose industry template | industry_template → process_definition + stages |
| Enable capabilities | organization.enabled_capabilities |
| Board declaration | board_declaration |
| CEO / MD declaration | board_declaration (type=ceo_md) |
| HR → Hire / Recruitment | job_vacancy, job_applicant, selection_scoring |
| Document management | document, document_template |

### Finance & account features → models

| Feature | Models |
|---------|--------|
| Purchase / Cr Note | purchase, credit_note |
| Purchase Order / Action Plan | purchase_order, action_plan |
| Sales / Cash-Bank | sales, cash_bank_account |
| Sales / Ledger | sales, ledger |
| Payment / Daybook | purchase_payment, day_book |
| Received / Debit | sales_received, debit_note |
| Income/Expenses | income_expense |
| Inventory | inventory.* |
| Profit/Loss | profit_loss_snapshot |
| Tax and Audit | tax_audit_record |
| Process costing | production_costing → journal_voucher |

### Process / Production features → models

| Feature | Models |
|---------|--------|
| Industry starter | industry_template |
| Custom process design | process_definition, process_stage, process_stage_field |
| Job / order | work_order |
| Execution | process_run, process_run_stage, process_run_line, process_field_value |
| Factory “Mixing / Packaging / Refine” UX | Same tables; stage labels + line_types |
| Software / Construction / Marketing UX | Same tables; different template stages |
| BOM / Batch (optional) | bom, bom_line, batch |
| Working report | working_report |
| Damage / Expire / Register | damage_expire, register_book |

### Cross-cutting features → models

| Feature | Models |
|---------|--------|
| Chat & video call | chat_*, call_session |
| Feed (jobs + social) | feed_post, job_vacancy.feed_post_id |
| Ecommerce consumer UX | commerce.* |
| Live stream | live_stream, live_market_session |
| Reports | analytics.*, audit_log |
| Stage evidence docs | document.entity_type + entity_id |

---

## 26. Entity Relationship Summary

```
TENANT
 └── ORGANIZATION
      │   industry_template_code, enabled_capabilities
      ├── ORG_USER → USER
      ├── DEPARTMENT → TEAM → EMPLOYEE → USER
      ├── PRODUCT → PRODUCT_IMAGE → ORDER_ITEM → ORDER → PAYMENT_TRANSACTION
      ├── PURCHASE_ORDER → GRN → STOCK_LEDGER
      │
      ├── INDUSTRY_TEMPLATE (system)
      │        ↓ install
      ├── PROCESS_DEFINITION → PROCESS_STAGE → PROCESS_STAGE_FIELD
      │        ↓
      ├── WORK_ORDER → PROCESS_RUN → PROCESS_RUN_STAGE → PROCESS_RUN_LINE
      │        │              │              │                    │
      │        │              │              ├── member_id (HR)
      │        │              │              ├── quality.in_process_qc / final_qa
      │        │              │              └── document (entity link)
      │        │              │
      │        │              └── STOCK_LEDGER (via run_line.item_id)
      │        │
      │        ├── BATCH / BOM (optional capabilities)
      │        ├── MATERIAL_ISSUE
      │        ├── PRODUCTION_COSTING → JOURNAL_VOUCHER (Finance)
      │        ├── WORKING_REPORT (HR hours)
      │        └── customer_party_id → PARTY / CRM / AD_CAMPAIGN
      │
      ├── SALES_ORDER → DISPATCH → POD
      ├── ASM/DEALER/RETAIL ORDERS → PARTY
      └── FINANCE (vouchers, ledger, daybook, P&L)

USER
 ├── USER_PROFILE + KYC_DOCUMENT + ADDRESS
 ├── FRIENDSHIP + STORY + THOUGHT_PORTAL
 ├── FEED_POST → FEED_MEDIA / ENGAGEMENT
 ├── CHAT_PARTICIPANT → CHAT_MESSAGE / CALL_SESSION
 ├── CART → ORDER
 └── SEARCH_QUERY_LOG / IMAGE_MATCH
```

---

## 27. Build Order

```
Phase 1 — Core
  tenant, actor, business_object, metadata_form,
  workflow_definition, workflow_instance, task, approval,
  policy, rule, audit_log, notification

Phase 2 — Identity & Organization
  user, user_profile, kyc_document, address, session, geo masters
  organization (incl. industry_template_code, enabled_capabilities),
  org_user, role, department, branch, team, board_declaration

Phase 3 — Consumer Platform
  platform_channel, feed_*, media_*, commerce_*,
  payment_*, ad_*, document_*, friendship, chat_*,
  live_stream, search/ai basics

Phase 4 — Organization ERP
  HR (employee, vacancy, applicant, attendance, leave, payroll)
  → Finance (COA, vouchers, purchase/sales docs, ledger, daybook)
  → Inventory (item, warehouse, GRN, stock)
  → Process Engine
       industry_template, process_definition, process_stage,
       process_stage_field, work_order, process_run,
       process_run_stage, process_run_line
       + optional: bom, batch
  → Sales & Logistics (party, ASM/DSM/RSM, dispatch, POD)
  → Quality + CRM + Maintenance (FKs to work_order / run_stage)

Phase 5 — Role Dashboards & Analytics
  dashboard_widget, kpi_snapshot, report_definition
  Manufacture / Operations / Software / Construction /
  Marketing / Distributor / Retail / Executive workspaces

Phase 6 — AI Layer
  embedding_index, image_match, voice_transcript,
  recommendations, auto-reports
```

---

## 28. Model Count Summary

| Module / Domain | Approx. Models |
|-----------------|----------------|
| Core Platform | 12 |
| Auth & Identity (+ geo) | 10 |
| Organization | 9 |
| Platform Channels | 2 |
| Search & AI | 4 |
| Feed | 5 |
| Media & Live | 5 |
| Ecommerce & Seller | 11 |
| Payment & Ads | 5 |
| Documentation | 3 |
| Customer Social extras | 6 |
| Chat Centre | 5 |
| HR & Admin | 12 |
| Finance & Procurement | 26 |
| Process Engine & Production | 18 |
| Inventory | 8 |
| Sales & Logistics | 13 |
| Quality | 7 |
| CRM | 3 |
| Maintenance | 4 |
| Analytics | 3 |
| **Total** | **~171 tables** |

---

## Related Documents

| File | Role |
|------|------|
| `project.md` | Vision, architecture, 11 departments, governance |
| `feature_and_module.md` | Forms, workflows, KPIs, field specs |
| `schemas/beos-platform-spec.json` | Engines, field types, schema names |
| `schemas/hr-database-schema.json` | HR tables (implementation-ready) |
| `schemas/department-erp-forms.json` | Production / QA / Stores form fields |
| `schemas/procurement-forms.json` | PR / PO / GRN / Vendor fields |
| `README.md` | Developer onboarding & build order |

---

*Generated for Sunyazon / BEOS implementation. Use this file as the canonical model catalog; forms remain metadata-driven at runtime per BEOS principles. Process Engine stages and fields are configurable per organization via industry templates + metadata — do not hardcode factory-only tables as the platform core.*
