import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/super-admin")({
  head: () => ({
    meta: [
      { title: "Super Admin — Sunyazon BEOS" },
      { name: "description", content: "Platform control center for all companies, users, roles and settings." },
    ],
  }),
  component: () => <Outlet />,
});
