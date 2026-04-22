"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button, cn, surfaceCardStyles } from "@huoziwriter/ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type ReviewsTabItem = {
  key: string;
  label: string;
  content: ReactNode;
};

const tabRailClassName = cn(
  surfaceCardStyles({ tone: "subtle", padding: "sm" }),
  "flex flex-wrap gap-2 p-2 shadow-none",
);

function getReviewTabSectionId(tabKey: string) {
  return `review-tab-${tabKey.replace(/[^a-z0-9]+/gi, "-")}`;
}

function resolveTabKey(tabs: ReviewsTabItem[], candidate: string | undefined, fallbackTabKey: string) {
  return tabs.find((item) => item.key === candidate)?.key ?? fallbackTabKey;
}

export function ReviewsTabShell({
  tabs,
  defaultTabKey,
}: {
  tabs: ReviewsTabItem[];
  defaultTabKey?: string;
}) {
  const fallbackTabKey = tabs[0]?.key ?? "";
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const resolvedDefaultTabKey = useMemo(
    () => resolveTabKey(tabs, defaultTabKey, fallbackTabKey),
    [defaultTabKey, fallbackTabKey, tabs],
  );
  const [activeTabKey, setActiveTabKey] = useState(resolvedDefaultTabKey);

  useEffect(() => {
    const nextTabKey = resolveTabKey(tabs, searchParams.get("tab") ?? resolvedDefaultTabKey, fallbackTabKey);
    setActiveTabKey((currentTabKey) => (currentTabKey === nextTabKey ? currentTabKey : nextTabKey));
  }, [fallbackTabKey, resolvedDefaultTabKey, searchParams, tabs]);

  const activeTab = useMemo(
    () => tabs.find((item) => item.key === activeTabKey) ?? tabs[0] ?? null,
    [activeTabKey, tabs],
  );

  if (!activeTab) {
    return null;
  }

  const handleTabChange = (nextTabKey: string) => {
    setActiveTabKey(nextTabKey);
    const nextSectionId = getReviewTabSectionId(nextTabKey);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTabKey);
    params.set("section", nextSectionId);
    router.replace(`${pathname}?${params.toString()}#${nextSectionId}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <div className={tabRailClassName}>
        {tabs.map((item) => (
          <Button
            key={item.key}
            type="button"
            variant={item.key === activeTab.key ? "primary" : "secondary"}
            size="sm"
            onClick={() => handleTabChange(item.key)}
          >
            {item.label}
          </Button>
        ))}
      </div>
      <div>{activeTab.content}</div>
    </div>
  );
}
