"use client";

import type { ReactNode } from "react";
import { adminNav } from "@/config/navigation";
import { requireWriterSession } from "@/lib/page-auth";
import { getAdminShellNotificationItems } from "@/lib/shell-notifications";
import { AdminShell } from "@/components/admin-shell";
import { AdminRouteForbiddenState } from "@/components/admin-route-state";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { session } = await requireWriterSession();
  if (session.role !== "admin") {
    return <AdminRouteForbiddenState />;
  }
  const notificationItems = await getAdminShellNotificationItems();
  return <AdminShell items={adminNav} notificationItems={notificationItems}>{children}</AdminShell>;
}
