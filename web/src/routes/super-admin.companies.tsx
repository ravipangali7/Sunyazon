import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, Factory, Truck, Warehouse, Store, Building } from "lucide-react";
import { SuperAdminShell } from "@/components/layout/SuperAdminShell";
import { QueryState } from "@/components/ui-bits/QueryState";
import { enterpriseApi, unwrapList } from "@/lib/enterprise-api";

export const Route = createFileRoute("/super-admin/companies")({
  head: () => ({
    meta: [{ title: "Companies — Super Admin" }],
  }),
  component: CompaniesPage,
});

type Company = {
  id: string;
  company_name?: string;
  account_type?: string;
  org_type?: string;
  is_verified?: boolean;
  is_active?: boolean;
};

function typeIcon(accountType?: string) {
  switch ((accountType || "").toLowerCase()) {
    case "producer":
      return Factory;
    case "distributor":
      return Truck;
    case "wholesaler":
      return Warehouse;
    case "retailer":
      return Store;
    default:
      return Building;
  }
}

function CompaniesPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["super-admin", "companies"],
    queryFn: async () => unwrapList(await enterpriseApi.companies()) as Company[],
  });

  const orgs = data ?? [];

  return (
    <SuperAdminShell
      title="Companies"
      subtitle="All organizations across the supply chain — producers, distributors, wholesalers, and retailers."
    >
      <QueryState isLoading={isLoading} isError={isError} error={error as Error} empty={false}>
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Building2 className="h-4 w-4" style={{ color: "var(--color-primary)" }} />
            <span className="text-sm font-semibold">Organization directory</span>
            <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
              {orgs.length} companies
            </span>
          </div>
          {orgs.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No companies found.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {orgs.map((o) => {
                const Icon = typeIcon(o.account_type);
                return (
                  <li key={o.id} className="px-4 py-3 flex items-center gap-3">
                    <div
                      className="h-10 w-10 rounded-lg grid place-items-center"
                      style={{ backgroundColor: "rgba(242,92,5,0.12)", color: "var(--color-primary)" }}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{o.company_name || "Untitled"}</div>
                      <div className="text-[11px] text-muted-foreground capitalize">
                        {o.account_type || o.org_type || "Organization"}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] uppercase tracking-wider font-semibold ${
                        o.is_verified ? "text-emerald-500" : "text-muted-foreground"
                      }`}
                    >
                      {o.is_verified ? "Verified" : o.is_active === false ? "Inactive" : "Pending"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </QueryState>
    </SuperAdminShell>
  );
}
