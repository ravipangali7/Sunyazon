import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { PortalDashboard } from "@/components/portals/PortalDashboard";
import { useAuth } from "@/lib/auth";
import { isPortalAccountType, PORTAL_CATALOG } from "@/lib/portal-catalog";

export const Route = createFileRoute("/portal/$portalType")({
  head: ({ params }) => {
    const meta = isPortalAccountType(params.portalType)
      ? PORTAL_CATALOG[params.portalType]
      : null;
    return {
      meta: [
        { title: `${meta?.title || "Portal"} — Sunyazon BEOS` },
        { name: "description", content: meta?.subtitle || "Organization admin portal" },
      ],
    };
  },
  component: PortalAdminPage,
});

function PortalAdminPage() {
  const { portalType } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const meta = isPortalAccountType(portalType) ? PORTAL_CATALOG[portalType] : null;

  useEffect(() => {
    if (loading) return;
    if (!user) {
      void navigate({ to: "/login" });
    }
  }, [user, loading, navigate]);

  if (!meta) {
    return (
      <AppShell title="Unknown portal">
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground mb-4">
            Portal “{portalType}” is not defined.
          </p>
          <Link
            to="/apps"
            className="text-sm font-semibold"
            style={{ color: "var(--color-primary)" }}
          >
            Back to apps
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={meta.title} subtitle={meta.subtitle}>
      <PortalDashboard
        meta={meta}
        userModules={user?.portal.modules}
        orgName={user?.portal.organization_name || user?.membership?.organization_name}
        userName={user?.full_name}
      />
    </AppShell>
  );
}
