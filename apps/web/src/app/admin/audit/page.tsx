import { AdminAuditClient } from "@/components/admin-audit-client";
import { getAdminAuditFilterOptions, getAdminAuditLogs } from "@/lib/audit";
import { requireAdminSession } from "@/lib/page-auth";

export default async function AdminAuditPage() {
  await requireAdminSession();
  const [logs, filters] = await Promise.all([
    getAdminAuditLogs(),
    getAdminAuditFilterOptions(),
  ]);

  return (
    <AdminAuditClient
      initialLogs={logs}
      actions={filters.actions}
      targetTypes={filters.targetTypes}
    />
  );
}
