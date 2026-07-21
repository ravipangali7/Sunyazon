/** Payments & Ads module API — overview, transactions, campaigns, gateways. */

import { apiFetch } from "./api";

export type Paginated<T> = {
  results: T[];
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
};

export type PaymentsOverview = {
  settled_amount: number;
  pending_amount: number;
  refunded_amount: number;
  txn_count: number;
  by_status: { name: string; code: string; value: number }[];
  active_campaigns: number;
  campaign_budget: number;
  campaign_spent: number;
  recent_txns: PaymentTxn[];
};

export type PaymentTxn = {
  id: string;
  ref: string;
  external_txn_id: string;
  order_id: string | null;
  ad_campaign_id: string | null;
  ad_campaign_title: string;
  gateway_id: string | null;
  gateway_code: string;
  gateway_name: string;
  amount: number;
  currency: string;
  status: string;
  payment_method: string;
  metadata_json: Record<string, unknown>;
  created_at: string;
};

export type PaymentCampaign = {
  id: string;
  title: string;
  name: string;
  advertiser_org_id: string | null;
  advertiser_org_name: string;
  plan_id: string | null;
  plan_code: string;
  plan_name: string;
  content_json: Record<string, unknown>;
  target_audience_json: Record<string, unknown>;
  budget: number;
  spent: number;
  payment_transaction_id: string | null;
  work_order_id: string | null;
  process_run_id: string | null;
  status: string;
  start_at: string;
  end_at: string;
};

export type PaymentGatewayOption = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
};

export type AdPlanOption = {
  id: string;
  code: string;
  name: string;
  price: number;
  duration_days: number;
  impressions_limit?: number;
  is_active: boolean;
};

export type PaymentsOptions = {
  gateways: PaymentGatewayOption[];
  ad_plans: AdPlanOption[];
  txn_statuses: { value: string; label: string }[];
  campaign_statuses: { value: string; label: string }[];
  currencies: string[];
};

type ListParams = {
  search?: string;
  status?: string;
  gateway?: string;
  page?: number;
  page_size?: number;
  sort?: string;
};

function qs(params: Record<string, string | number | boolean | undefined | null> = {}) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const paymentsApi = {
  overview: () => apiFetch<PaymentsOverview>("/payments/overview/"),
  options: () => apiFetch<PaymentsOptions>("/payments/options/"),

  gateways: (params: ListParams = {}) =>
    apiFetch<Paginated<PaymentGatewayOption>>(`/payments/gateways/${qs(params)}`),

  transactions: (params: ListParams = {}) =>
    apiFetch<Paginated<PaymentTxn>>(`/payments/transactions/${qs(params)}`),
  transaction: (id: string) => apiFetch<PaymentTxn>(`/payments/transactions/${id}/`),
  createTransaction: (body: Record<string, unknown>) =>
    apiFetch<PaymentTxn>("/payments/transactions/", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateTransaction: (id: string, body: Record<string, unknown>) =>
    apiFetch<PaymentTxn>(`/payments/transactions/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  txnAction: (id: string, action: "mark_success" | "mark_failed" | "refund", extra: Record<string, unknown> = {}) =>
    apiFetch<PaymentTxn>(`/payments/transactions/${id}/`, {
      method: "POST",
      body: JSON.stringify({ action, ...extra }),
    }),

  campaigns: (params: ListParams = {}) =>
    apiFetch<Paginated<PaymentCampaign>>(`/payments/campaigns/${qs(params)}`),
  campaign: (id: string) => apiFetch<PaymentCampaign>(`/payments/campaigns/${id}/`),
  createCampaign: (body: Record<string, unknown>) =>
    apiFetch<PaymentCampaign>("/payments/campaigns/", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateCampaign: (id: string, body: Record<string, unknown>) =>
    apiFetch<PaymentCampaign>(`/payments/campaigns/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteCampaign: (id: string) =>
    apiFetch<{ ok: boolean }>(`/payments/campaigns/${id}/`, { method: "DELETE" }),
  campaignAction: (id: string, action: "activate" | "pause" | "complete") =>
    apiFetch<PaymentCampaign>(`/payments/campaigns/${id}/`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
};
