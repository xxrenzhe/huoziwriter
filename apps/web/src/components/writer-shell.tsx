"use client";

import { Button, buttonStyles, cn, surfaceCardStyles } from "@huoziwriter/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Bell, Command, FileText, LayoutDashboard, Search, Settings2, Sparkles, ClipboardCheck, type LucideIcon } from "lucide-react";
import { useCommandMenu } from "@/components/command-menu";
import { NotificationCenter, type NotificationCenterItem } from "@/components/notification-center";
import { formatPlanDisplayName } from "@/lib/plan-labels";

type NavItem = {
  href: string;
  label: string;
};

const shellRailNavLinkBaseClassName = "block px-3 py-3 text-sm shadow-none transition-colors";
const workspaceRailCommandTriggerClassName = cn(
  buttonStyles({ variant: "secondary", size: "sm" }),
  "h-11 w-11 border-lineStrong bg-surface px-0 py-0 text-inkMuted hover:border-danger hover:bg-surfaceHighlight hover:text-danger",
);
const workspaceQuotaCardClassName = cn(surfaceCardStyles({ padding: "sm" }), "border-lineStrong bg-surface shadow-none");
const workspaceSearchTriggerClassName = cn(
  buttonStyles({ variant: "secondary", size: "sm" }),
  "border-lineStrong text-inkMuted hover:border-lineStrong hover:text-ink",
);
const workspaceMobileTabBarClassName = cn(
  surfaceCardStyles({ tone: "warm", padding: "sm" }),
  "mx-auto grid max-w-md grid-cols-4 gap-1 border-lineStrong bg-surfaceWarm p-2 shadow-[0_18px_36px_rgba(88,65,64,0.14)] backdrop-blur-md",
);
const workspaceUtilityIconButtonClassName = cn(
  buttonStyles({ variant: "secondary", size: "sm" }),
  "h-10 w-10 border-lineStrong bg-surface px-0 py-0 text-inkMuted hover:border-lineStrong hover:bg-surface hover:text-ink",
);
const workspaceMobileNavIcons: Record<string, LucideIcon> = {
  "/warroom": LayoutDashboard,
  "/articles": FileText,
  "/reviews": ClipboardCheck,
  "/settings": Settings2,
};

function normalizeShellHref(href: string) {
  if (href === "/dashboard") return "/warroom";
  if (href === "/review") return "/reviews";
  return href;
}

function normalizeShellItems(items: NavItem[]) {
  return items.map((item) => ({ ...item, href: normalizeShellHref(item.href) }));
}

function isShellPathActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function shellRailNavLinkClassName(active: boolean) {
  return cn(
    surfaceCardStyles({ interactive: !active }),
    shellRailNavLinkBaseClassName,
    active
      ? "border-danger bg-danger text-white"
      : "border-transparent bg-transparent text-inkSoft hover:border-lineStrong hover:bg-surface hover:text-ink",
  );
}

function workspaceMobileTabLinkClassName(active: boolean) {
  return cn(
    surfaceCardStyles({ interactive: !active }),
    "flex min-h-[56px] min-w-0 flex-col items-center justify-center gap-1 rounded-[1.25rem] border px-2 py-2 text-[11px] font-medium leading-none shadow-none transition-colors touch-manipulation",
    active
      ? "border-danger bg-danger text-white"
      : "border-transparent bg-transparent text-inkMuted hover:border-lineStrong hover:bg-surface hover:text-ink",
  );
}

function describeUsageStatus(currentUsage: number, usageLimit: number | null) {
  if (usageLimit == null) {
    return {
      tone: "success" as const,
      title: `当前套餐今日生成不限额，已使用 ${currentUsage} 次。`,
      badge: "不限额",
    };
  }

  const remaining = Math.max(usageLimit - currentUsage, 0);
  if (currentUsage >= usageLimit) {
    return {
      tone: "warning" as const,
      title: `今日配额已经用满，当前 ${currentUsage} / ${usageLimit}。`,
      badge: "需节流",
    };
  }

  if (currentUsage / Math.max(usageLimit, 1) >= 0.75) {
    return {
      tone: "highlight" as const,
      title: `今日配额进入高水位，剩余 ${remaining} 次可生成。`,
      badge: "高水位",
    };
  }

  return {
    tone: "default" as const,
    title: `今日配额余量充足，剩余 ${remaining} / ${usageLimit}。`,
    badge: "正常",
  };
}

function buildWorkspaceNotificationItems({
  currentUsage,
  usageLimit,
  currentSectionHref,
  currentSectionLabel,
  statusHeadline,
  statusDetail,
  openMenu,
  toggleTheme,
  toggleFocusMode,
}: {
  currentUsage: number;
  usageLimit: number | null;
  currentSectionHref: string;
  currentSectionLabel: string;
  statusHeadline: string;
  statusDetail: string;
  openMenu: () => void;
  toggleTheme: () => void;
  toggleFocusMode: () => void;
}): NotificationCenterItem[] {
  const usageStatus = describeUsageStatus(currentUsage, usageLimit);

  return [
    {
      id: "workspace-usage",
      title: "今日写作配额",
      description: usageStatus.title,
      badge: usageStatus.badge,
      kind: "billing",
      tone: usageStatus.tone,
      timestampLabel: "实时同步",
    },
    {
      id: "workspace-current",
      title: `当前主链路：${currentSectionLabel}`,
      description: `${statusHeadline} ${statusDetail}`.trim(),
      kind: "article",
      tone: "highlight",
      unread: true,
      meta: "写作区",
      timestampLabel: "需要关注",
      href: currentSectionHref,
    },
    {
      id: "workspace-quick-actions",
      title: "常用入口已集中",
      description: "命令面板、主题切换和沉浸模式都保留了显式入口，不需要记忆任何按键。",
      kind: "system",
      meta: "效率",
      actions: [
        {
          id: "workspace-open-command",
          label: "打开命令面板",
          variant: "secondary",
          onSelect: openMenu,
        },
        {
          id: "workspace-toggle-theme",
          label: "切换日夜模式",
          variant: "ghost",
          onSelect: toggleTheme,
        },
        {
          id: "workspace-toggle-focus",
          label: "进入专注模式",
          variant: "ghost",
          onSelect: toggleFocusMode,
        },
      ],
    },
  ];
}

function CommandTrigger({
  label,
  icon,
  className,
  labelClassName = "",
}: {
  label: string;
  icon: ReactNode;
  className: string;
  labelClassName?: string;
}) {
  const { openMenu } = useCommandMenu();

  return (
    <Button type="button" onClick={openMenu} className={className} iconLeft={icon}>
      <span className={labelClassName}>{label}</span>
    </Button>
  );
}

export function WriterShell({
  items,
  children,
  currentPlanName,
  currentUsage,
  usageLimit,
  statusHeadline,
  statusDetail,
}: {
  items: NavItem[];
  children: ReactNode;
  currentPlanName: string;
  currentUsage: number;
  usageLimit: number | null;
  statusHeadline: string;
  statusDetail: string;
}) {
  const pathname = usePathname();
  const { openMenu, toggleTheme, toggleFocusMode } = useCommandMenu();
  const normalizedItems = normalizeShellItems(items);
  const displayPlanName = formatPlanDisplayName(currentPlanName);
  const usageText = usageLimit == null ? `${currentUsage} / 不限` : `${currentUsage} / ${usageLimit}`;
  const usageWidth = usageLimit == null ? 40 : Math.max(8, Math.min(100, Math.round((currentUsage / Math.max(usageLimit, 1)) * 100)));
  const currentSectionItem =
    normalizedItems.find((item) => isShellPathActive(pathname, item.href)) ?? normalizedItems[0] ?? { href: "/warroom", label: "作战台" };
  const currentSection = currentSectionItem.label;
  const workspaceNotificationItems = buildWorkspaceNotificationItems({
    currentUsage,
    usageLimit,
    currentSectionHref: currentSectionItem.href,
    currentSectionLabel: currentSectionItem.label,
    statusHeadline,
    statusDetail,
    openMenu,
    toggleTheme,
    toggleFocusMode,
  });

  return (
    <div className="min-h-screen bg-surfaceAlt text-ink">
      <div data-command-focus-root="workspace" className="grid min-h-screen grid-cols-1 lg:grid-cols-[88px_260px_minmax(0,1fr)]">
        <aside data-command-chrome="true" className="hidden border-r border-line bg-paperStrong px-5 py-8 lg:block">
          <div className="space-y-10">
            <div className="font-sansCn text-sm font-semibold tracking-[0.24em] text-cinnabar">
              HuoZi
            </div>
            <div className="space-y-4 text-inkMuted">
              <CommandTrigger
                label="快速搜索"
                icon={<Sparkles size={18} />}
                className={workspaceRailCommandTriggerClassName}
                labelClassName="sr-only"
              />
              <CommandTrigger
                label="搜索"
                icon={<Search size={18} />}
                className={workspaceRailCommandTriggerClassName}
                labelClassName="sr-only"
              />
              <CommandTrigger
                label="命令"
                icon={<Command size={18} />}
                className={workspaceRailCommandTriggerClassName}
                labelClassName="sr-only"
              />
            </div>
          </div>
        </aside>
        <aside data-command-chrome="true" className="border-b border-line bg-surfaceMuted px-5 py-8 md:border-b-0 lg:border-r">
          <div className="mb-8 border-b border-line pb-6">
            <div className="font-sansCn text-xs uppercase tracking-[0.3em] text-inkMuted">主工作流</div>
            <div className="mt-3 font-serifCn text-3xl font-semibold text-balance">公众号爆款写作系统</div>
            <p className="mt-3 text-sm leading-7 text-inkSoft">
              把今天值得写的题、正在推进的稿件和结果回流收进作战台、稿件区与复盘主链路。
            </p>
          </div>
          <nav aria-label="写作区主导航" className="hidden space-y-2 md:block">
            {normalizedItems.map((item) => {
              const active = isShellPathActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={shellRailNavLinkClassName(active)}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-8 space-y-3 border-t border-line pt-6">
            <div className="text-xs uppercase tracking-[0.28em] text-inkMuted">当前配额</div>
            <div className={workspaceQuotaCardClassName}>
              <div className="text-sm text-inkSoft">{displayPlanName}</div>
              <div className="mt-3 flex items-end justify-between">
                <div className="font-serifCn text-3xl text-ink text-balance">{usageText}</div>
                <div className="text-xs text-inkMuted">今日生成</div>
              </div>
              <div className="mt-4 h-2 overflow-hidden border border-line bg-paperStrong">
                <div className="h-full bg-danger" style={{ width: `${usageWidth}%` }} />
              </div>
            </div>
          </div>
        </aside>
        <main className="bg-paper px-6 py-8 pb-32 md:px-8 md:pb-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
            <div>
              <div className="text-xs uppercase tracking-[0.28em] text-inkMuted">{currentSection}</div>
              <div className="mt-2 font-serifCn text-2xl text-balance">{statusHeadline}</div>
              <div className="mt-2 text-sm leading-7 text-inkSoft">{statusDetail}</div>
            </div>
            <div className="flex items-center gap-3 text-inkMuted">
              <CommandTrigger
                label="搜索素材、稿件、打法"
                icon={<Search size={16} />}
                className={workspaceSearchTriggerClassName}
              />
              <NotificationCenter
                items={workspaceNotificationItems}
                triggerClassName={workspaceUtilityIconButtonClassName}
                triggerAriaLabel="打开写作区通知中心"
                triggerIcon={<Bell size={16} />}
                title="写作区通知中心"
                description="把配额、当前推进重点和常用入口收进一个入口，减少主链路切换成本。"
                footer={
                  <div>命令面板、主题切换和沉浸模式都可通过当前页显式入口直接打开。</div>
                }
              />
            </div>
          </div>
          {children}
        </main>
      </div>
      <div
        data-command-chrome="true"
        className="fixed inset-x-0 bottom-0 z-40 px-4 md:hidden"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
      >
        <nav aria-label="写作区主导航" className={workspaceMobileTabBarClassName}>
          {normalizedItems.map((item) => {
            const active = isShellPathActive(pathname, item.href);
            const Icon = workspaceMobileNavIcons[item.href] ?? Sparkles;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-label={active ? `${item.label}，当前页` : item.label}
                className={workspaceMobileTabLinkClassName(active)}
              >
                <Icon size={18} aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
