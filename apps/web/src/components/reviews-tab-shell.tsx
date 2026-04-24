"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
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

function getReviewTabButtonId(tabKey: string) {
  return `review-tab-button-${tabKey.replace(/[^a-z0-9]+/gi, "-")}`;
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
  const tabButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

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

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    if (tabs.length <= 1) {
      return;
    }
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabs.length - 1;
    }
    if (nextIndex == null) {
      return;
    }
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    handleTabChange(nextTab.key);
    tabButtonRefs.current[nextTab.key]?.focus();
  };

  return (
    <div className="space-y-6">
      <div className={tabRailClassName} role="tablist" aria-label="复盘分类切换">
        {tabs.map((item, index) => (
          <Button
            key={item.key}
            id={getReviewTabButtonId(item.key)}
            type="button"
            role="tab"
            aria-selected={item.key === activeTab.key}
            aria-controls={getReviewTabSectionId(item.key)}
            tabIndex={item.key === activeTab.key ? 0 : -1}
            variant={item.key === activeTab.key ? "primary" : "secondary"}
            size="sm"
            ref={(node) => {
              tabButtonRefs.current[item.key] = node;
            }}
            onClick={() => handleTabChange(item.key)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {item.label}
          </Button>
        ))}
      </div>
      <div
        id={getReviewTabSectionId(activeTab.key)}
        role="tabpanel"
        aria-labelledby={getReviewTabButtonId(activeTab.key)}
      >
        {activeTab.content}
      </div>
    </div>
  );
}
