import type { ReactNode } from "react";
import { writerNav } from "@/config/navigation";
import { requireWriterSession } from "@/lib/page-auth";
import { WriterShell } from "@/components/site-shells";

export default async function WriterLayout({ children }: { children: ReactNode }) {
  await requireWriterSession();
  return <WriterShell items={writerNav}>{children}</WriterShell>;
}
