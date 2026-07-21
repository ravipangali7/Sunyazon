import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { domainApi } from "@/lib/domain-api";
import { getToken } from "@/lib/api";

const enabled = () => typeof window !== "undefined" && !!getToken();

export function useDashboard() {
  return useQuery({ queryKey: ["dashboard"], queryFn: domainApi.dashboard, enabled: enabled() });
}
export function useTasks() {
  return useQuery({ queryKey: ["tasks"], queryFn: domainApi.tasks, enabled: enabled() });
}
export function useEmployees() {
  return useQuery({ queryKey: ["employees"], queryFn: domainApi.employees, enabled: enabled() });
}
export function useAttendance() {
  return useQuery({ queryKey: ["attendance"], queryFn: () => domainApi.attendance(), enabled: enabled() });
}
export function useWorkOrders() {
  return useQuery({ queryKey: ["work-orders"], queryFn: domainApi.workOrders, enabled: enabled() });
}
export function useStock() {
  return useQuery({ queryKey: ["stock"], queryFn: domainApi.stock, enabled: enabled() });
}
export function useStockMovements() {
  return useQuery({ queryKey: ["stock-movements"], queryFn: domainApi.stockMovements, enabled: enabled() });
}
export function useSalesOrders() {
  return useQuery({ queryKey: ["sales-orders"], queryFn: domainApi.salesOrders, enabled: enabled() });
}
export function useSalesByRegion() {
  return useQuery({ queryKey: ["sales-by-region"], queryFn: domainApi.salesByRegion, enabled: enabled() });
}
export function useFinance() {
  return useQuery({ queryKey: ["finance"], queryFn: domainApi.finance, enabled: enabled() });
}
export function useProcurement() {
  return useQuery({ queryKey: ["procurement"], queryFn: domainApi.procurement, enabled: enabled() });
}
export function useQuality() {
  return useQuery({ queryKey: ["quality"], queryFn: domainApi.quality, enabled: enabled() });
}
export function useCrm() {
  return useQuery({ queryKey: ["crm"], queryFn: domainApi.crm, enabled: enabled() });
}
export function useMaintenance() {
  return useQuery({ queryKey: ["maintenance"], queryFn: domainApi.maintenance, enabled: enabled() });
}
export function useLogistics() {
  return useQuery({ queryKey: ["logistics"], queryFn: domainApi.logistics, enabled: enabled() });
}
export function useNotifications() {
  return useQuery({ queryKey: ["notifications"], queryFn: domainApi.notifications, enabled: enabled() });
}
export function useCommerce() {
  return useQuery({ queryKey: ["commerce"], queryFn: domainApi.commerce, enabled: enabled() });
}
export function useFeed() {
  return useQuery({ queryKey: ["feed"], queryFn: domainApi.feed, enabled: enabled() });
}
export function useChatThreads() {
  return useQuery({ queryKey: ["chat"], queryFn: domainApi.chat, enabled: enabled() });
}
export function useChatMessages(threadId: string | null) {
  return useQuery({
    queryKey: ["chat-messages", threadId],
    queryFn: () => domainApi.chatMessages(threadId!),
    enabled: enabled() && !!threadId,
  });
}
export function useAdminConsole() {
  return useQuery({ queryKey: ["admin-console"], queryFn: domainApi.admin, enabled: enabled() });
}
export function useProcess(definitionId?: string | null) {
  return useQuery({
    queryKey: ["process", definitionId || "default"],
    queryFn: () => domainApi.process(definitionId),
    enabled: enabled(),
  });
}
export function useMedia() {
  return useQuery({ queryKey: ["media"], queryFn: domainApi.media, enabled: enabled() });
}
export function usePayments() {
  return useQuery({ queryKey: ["payments"], queryFn: domainApi.payments, enabled: enabled() });
}
export function useGovernance() {
  return useQuery({ queryKey: ["governance"], queryFn: domainApi.governance, enabled: enabled() });
}
export function useAudit() {
  return useQuery({ queryKey: ["audit"], queryFn: domainApi.audit, enabled: enabled() });
}
export function useAuthKyc() {
  return useQuery({ queryKey: ["auth-kyc"], queryFn: domainApi.authKyc, enabled: enabled() });
}
export function useIt() {
  return useQuery({ queryKey: ["it"], queryFn: domainApi.it, enabled: enabled() });
}
export function useDocs() {
  return useQuery({ queryKey: ["docs"], queryFn: domainApi.docs, enabled: enabled() });
}
export function useCustomer() {
  return useQuery({ queryKey: ["customer"], queryFn: domainApi.customer, enabled: enabled() });
}
export function useRnd() {
  return useQuery({ queryKey: ["rnd"], queryFn: domainApi.rnd, enabled: enabled() });
}

/** Domain mutation hooks — invalidate matching GET caches after service-backed actions. */
export function useDomainMutations() {
  const qc = useQueryClient();
  const invalidate = (...keys: string[]) =>
    keys.forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));

  return {
    procurementPr: useMutation({
      mutationFn: ({
        id,
        action,
        reason,
      }: {
        id: string;
        action: "submit" | "approve" | "reject";
        reason?: string;
      }) => domainApi.procurementPrAction(id, action, reason),
      onSuccess: () => invalidate("procurement"),
    }),
    procurementPo: useMutation({
      mutationFn: ({ id, action }: { id: string; action: "approve" | "send" | "cancel" }) =>
        domainApi.procurementPoAction(id, action),
      onSuccess: () => invalidate("procurement"),
    }),
    procurementGrn: useMutation({
      mutationFn: ({
        id,
        action,
        warehouseId,
      }: {
        id: string;
        action: "receive" | "post";
        warehouseId?: string;
      }) => domainApi.procurementGrnAction(id, action, warehouseId),
      onSuccess: () => invalidate("procurement", "stock", "stock-movements"),
    }),
    stockReorder: useMutation({
      mutationFn: ({ itemId, qty }: { itemId: string; qty?: number }) =>
        domainApi.stockReorderPr(itemId, qty),
      onSuccess: () => invalidate("procurement", "stock"),
    }),
    qualityQc: useMutation({
      mutationFn: ({
        id,
        status,
      }: {
        id: string;
        status: "pass" | "fail" | "hold" | "pending";
      }) => domainApi.qualityQcAction(id, status),
      onSuccess: () => invalidate("quality"),
    }),
    qualityRelease: useMutation({
      mutationFn: ({
        id,
        releaseStatus,
      }: {
        id: string;
        releaseStatus: "held" | "released" | "rejected";
      }) => domainApi.qualityReleaseAction(id, releaseStatus),
      onSuccess: () => invalidate("quality"),
    }),
    salesApprove: useMutation({
      mutationFn: (id: string) => domainApi.salesOrderAction(id, "approve"),
      onSuccess: () => invalidate("sales-orders"),
    }),
    logistics: useMutation({
      mutationFn: ({
        id,
        action,
        extra,
      }: {
        id: string;
        action: "load" | "dispatch" | "pod" | "cancel";
        extra?: Record<string, unknown>;
      }) => domainApi.logisticsDispatchAction(id, action, extra),
      onSuccess: () => invalidate("logistics"),
    }),
    crmDeal: useMutation({
      mutationFn: ({ id, action, notes }: { id: string; action: "won" | "lost"; notes?: string }) =>
        domainApi.crmDealAction(id, action, notes),
      onSuccess: () => invalidate("crm"),
    }),
    maintenanceClose: useMutation({
      mutationFn: (id: string) => domainApi.maintenanceWoAction(id, "close"),
      onSuccess: () => invalidate("maintenance"),
    }),
    chatSend: useMutation({
      mutationFn: ({ threadId, body }: { threadId: string; body: string }) =>
        domainApi.chatSend(threadId, body),
      onSuccess: (_d, v) => {
        void qc.invalidateQueries({ queryKey: ["chat-messages", v.threadId] });
        void qc.invalidateQueries({ queryKey: ["chat"] });
      },
    }),
    feedEngage: useMutation({
      mutationFn: ({
        id,
        type,
        commentText,
      }: {
        id: string;
        type: "like" | "comment" | "share" | "save";
        commentText?: string;
      }) => domainApi.feedEngage(id, type, commentText),
      onSuccess: () => invalidate("feed"),
    }),
    notificationRead: useMutation({
      mutationFn: (id: string) => domainApi.notificationMarkRead(id),
      onSuccess: () => invalidate("notifications"),
    }),
    kycVerify: useMutation({
      mutationFn: ({
        id,
        approved,
        reason,
      }: {
        id: string;
        approved: boolean;
        reason?: string;
      }) => domainApi.authKycVerify(id, approved, reason),
      onSuccess: () => invalidate("auth-kyc"),
    }),
  };
}
