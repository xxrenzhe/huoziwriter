"use client";

import type { ReactNode } from "react";
import { marketingNav } from "@/config/navigation";
import { MarketingShell } from "@/components/marketing-shell";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <MarketingShell items={marketingNav}>{children}</MarketingShell>;
}
