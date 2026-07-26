import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { SuperAdminShell } from "@/components/layout/SuperAdminShell";
import { QueryState } from "@/components/ui-bits/QueryState";
import { enterpriseApi, unwrapList } from "@/lib/enterprise-api";

export const Route = createFileRoute("/super-admin/users")({
  head: () => ({
    meta: [{ title: "Users — Super Admin" }],
  }),
  component: UsersPage,
});

type PlatformUser = {
  id: string;
  full_name?: string;
  phone?: string | null;
  email?: string | null;
  account_type?: string;
  platform_role?: string;
  role_name?: string | null;
  company_name?: string;
  is_active?: boolean;
};

function UsersPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["super-admin", "users"],
    queryFn: async () => unwrapList(await enterpriseApi.users()) as PlatformUser[],
  });

  const users = data ?? [];

  return (
    <SuperAdminShell
      title="Users"
      subtitle="Every platform account — filter by account type, role, and organization."
    >
      <QueryState isLoading={isLoading} isError={isError} error={error as Error} empty={false}>
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Users className="h-4 w-4" style={{ color: "var(--color-primary)" }} />
            <span className="text-sm font-semibold">User directory</span>
            <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
              {users.length} users
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border">
                  <th className="px-4 py-2 font-semibold">Name</th>
                  <th className="px-4 py-2 font-semibold">Phone</th>
                  <th className="px-4 py-2 font-semibold">Account</th>
                  <th className="px-4 py-2 font-semibold">Role</th>
                  <th className="px-4 py-2 font-semibold">Organization</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No users found.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="hover:bg-secondary/40">
                      <td className="px-4 py-2.5 font-medium">{u.full_name || "—"}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                        {u.phone || "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-[11px] rounded-md bg-secondary px-2 py-0.5 font-semibold">
                          {u.account_type || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {u.role_name || u.platform_role || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[12rem]">
                        {u.company_name || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </QueryState>
    </SuperAdminShell>
  );
}
