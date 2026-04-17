import type { ReactNode } from "react";
import { adminNav } from "@/config/navigation";
import { requireAdminSession } from "@/lib/page-auth";
import { AdminShell } from "@/components/site-shells";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdminSession();
  return <AdminShell items={adminNav}>{children}</AdminShell>;
}
