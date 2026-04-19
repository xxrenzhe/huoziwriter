import type { ReactNode } from "react";
import { adminNav } from "@/config/navigation";
import { requireWriterSession } from "@/lib/page-auth";
import { AdminShell } from "@/components/site-shells";
import { AdminRouteForbiddenState } from "@/components/admin-route-state";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { session } = await requireWriterSession();
  if (session.role !== "admin") {
    return <AdminRouteForbiddenState />;
  }
  return <AdminShell items={adminNav}>{children}</AdminShell>;
}
