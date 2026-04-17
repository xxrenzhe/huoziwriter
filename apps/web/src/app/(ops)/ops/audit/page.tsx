import { OpsAuditClient } from "@/components/ops-audit-client";
import { getOpsAuditFilterOptions, getOpsAuditLogs } from "@/lib/audit";
import { requireOpsSession } from "@/lib/page-auth";

export default async function OpsAuditPage() {
  await requireOpsSession();
  const [logs, filters] = await Promise.all([
    getOpsAuditLogs(),
    getOpsAuditFilterOptions(),
  ]);

  return (
    <OpsAuditClient
      initialLogs={logs}
      actions={filters.actions}
      targetTypes={filters.targetTypes}
    />
  );
}
