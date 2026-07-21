import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { enterpriseApi, unwrapList, type EnterpriseTask, type TaskStatusRow } from "@/lib/enterprise-api";
import { getToken } from "@/lib/api";

const enabled = () => typeof window !== "undefined" && !!getToken();

export function useMenus() {
  return useQuery({
    queryKey: ["menus"],
    queryFn: async () => {
      const res = await enterpriseApi.menus();
      return res.results || [];
    },
    enabled: enabled(),
    staleTime: 60_000,
  });
}

export function useTaskStatuses() {
  return useQuery({
    queryKey: ["task-statuses"],
    queryFn: async () => {
      const res = await enterpriseApi.taskStatuses();
      return unwrapList(res as { results: TaskStatusRow[] }).filter((s) => s.show_in_filter !== false);
    },
    enabled: enabled(),
    staleTime: 60_000,
  });
}

export function useEnterpriseTasks(filters?: Record<string, string | number | undefined>) {
  return useQuery({
    queryKey: ["v2-tasks", filters],
    queryFn: async () => {
      const res = await enterpriseApi.tasks(filters);
      return res.results || [];
    },
    enabled: enabled(),
  });
}

export function useEnterpriseDashboard() {
  return useQuery({
    queryKey: ["v2-dashboard"],
    queryFn: () => enterpriseApi.dashboard(),
    enabled: enabled(),
  });
}

export function useTodayMission() {
  return useQuery({
    queryKey: ["today-mission"],
    queryFn: () => enterpriseApi.todayMission(),
    enabled: enabled(),
  });
}

export function useUnreadNotifications(pollMs = 30000) {
  return useQuery({
    queryKey: ["unread-notifications"],
    queryFn: () => enterpriseApi.unreadCount(),
    enabled: enabled(),
    refetchInterval: pollMs,
  });
}

export function useGlobalSearch(q: string) {
  return useQuery({
    queryKey: ["search", q],
    queryFn: () => enterpriseApi.search(q),
    enabled: enabled() && q.trim().length >= 2,
  });
}

export function useTaskMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["v2-tasks"] });
    void qc.invalidateQueries({ queryKey: ["v2-dashboard"] });
    void qc.invalidateQueries({ queryKey: ["today-mission"] });
  };
  return {
    create: useMutation({
      mutationFn: (body: Record<string, unknown>) => enterpriseApi.createTask(body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
        enterpriseApi.updateTask(id, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => enterpriseApi.deleteTask(id),
      onSuccess: invalidate,
    }),
    duplicate: useMutation({
      mutationFn: (id: string) => enterpriseApi.duplicateTask(id),
      onSuccess: invalidate,
    }),
    archive: useMutation({
      mutationFn: (id: string) => enterpriseApi.archiveTask(id),
      onSuccess: invalidate,
    }),
    restore: useMutation({
      mutationFn: (id: string) => enterpriseApi.restoreTask(id),
      onSuccess: invalidate,
    }),
  };
}

export type { EnterpriseTask, TaskStatusRow };
