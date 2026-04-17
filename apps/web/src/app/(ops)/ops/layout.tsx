import type { ReactNode } from "react";
import { opsNav } from "@/config/navigation";
import { requireOpsSession } from "@/lib/page-auth";
import { OpsShell } from "@/components/site-shells";

export default async function OpsLayout({ children }: { children: ReactNode }) {
  await requireOpsSession();
  return <OpsShell items={opsNav}>{children}</OpsShell>;
}
