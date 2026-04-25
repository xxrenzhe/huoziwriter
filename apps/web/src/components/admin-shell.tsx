"use client";

import { Button, buttonStyles, cn, surfaceCardStyles } from "@huoziwriter/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Bell, Command } from "lucide-react";
import { useCommandMenu } from "@/components/command-menu";
import { NotificationCenter, type NotificationCenterItem } from "@/components/notification-center";

type NavItem = {
  href: string;
  label: string;
};

const shellRailNavLinkBaseClassName = "block px-3 py-3 text-sm shadow-none transition-colors";
const adminCommandTriggerClassName = cn(
  buttonStyles({ variant: "secondary", size: "sm" }),
  "border-adminLineStrong bg-adminSurfaceMuted text-adminInkSoft hover:border-adminLineStrong hover:bg-adminSurfaceAlt hover:text-adminInk focus-visible:ring-adminAccent focus-visible:ring-offset-adminBg",
);
const adminNotificationTriggerClassName = cn(
  buttonStyles({ variant: "secondary", size: "sm" }),
  "h-10 w-10 border-adminLineStrong bg-adminSurfaceMuted px-0 py-0 text-adminInkSoft hover:border-adminLineStrong hover:bg-adminSurfaceAlt hover:text-adminInk focus-visible:ring-adminAccent focus-visible:ring-offset-adminBg",
);
const adminAccountCardClassName = cn(
  surfaceCardStyles({ padding: "sm" }),
  "border-adminLineStrong bg-adminSurfaceMuted text-adminInk shadow-none",
);
const adminStatusPillClassName = cn(
  surfaceCardStyles(),
  "border-adminLineStrong bg-adminSurfaceMuted px-4 py-2 text-sm text-adminInk shadow-none",
);

function normalizeShellHref(href: string) {
  if (href === "/dashboard") return "/warroom";
  if (href === "/review") return "/reviews";
  return href;
}

function normalizeShellItems(items: NavItem[]) {
  return items.map((item) => ({ ...item, href: normalizeShellHref(item.href) }));
}

function isShellPathActive(pathname: string, href: string) {
  return pathname === href;
}

function shellRailNavLinkClassName(active: boolean) {
  return cn(
    surfaceCardStyles({ interactive: !active }),
    shellRailNavLinkBaseClassName,
    active
      ? "border-danger bg-danger text-white"
      : "border-transparent bg-transparent text-adminInkMuted hover:border-adminLineStrong hover:bg-adminSurfaceAlt hover:text-adminInk",
  );
}

function buildAdminNotificationItems({
  openMenu,
}: {
  openMenu: () => void;
}): NotificationCenterItem[] {
  return [
    {
      id: "admin-command-utility",
      title: "后台命令中心",
      description: "顶部入口可直接搜索模块、跳转页面并触发常用动作。",
      kind: "system",
      meta: "效率入口",
      actions: [
        {
          id: "admin-open-command",
          label: "立即打开",
          variant: "secondary",
          onSelect: openMenu,
        },
      ],
    },
  ];
}

function CommandTrigger({
  label,
  icon,
  className,
}: {
  label: string;
  icon: ReactNode;
  className: string;
}) {
  const { openMenu } = useCommandMenu();

  return (
    <Button type="button" onClick={openMenu} className={className} iconLeft={icon}>
      <span>{label}</span>
    </Button>
  );
}

export function AdminShell({
  items,
  children,
  notificationItems = [],
}: {
  items: NavItem[];
  children: ReactNode;
  notificationItems?: NotificationCenterItem[];
}) {
  const pathname = usePathname();
  const { openMenu } = useCommandMenu();
  const normalizedItems = normalizeShellItems(items);
  const adminNotificationItems = [...notificationItems, ...buildAdminNotificationItems({ openMenu })];

  return (
    <div className="min-h-screen bg-adminBg text-adminInk">
      <div data-command-focus-root="admin" className="grid min-h-screen grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside data-command-chrome="true" className="bg-adminSurface px-6 py-8">
          <div className="mb-8 space-y-2 border-b border-adminLineStrong pb-6">
            <div className="font-sansCn text-xs uppercase tracking-[0.25em] text-adminInkMuted">
              HuoZi Writer
            </div>
            <div className="font-serifCn text-3xl font-semibold text-adminInk text-balance">
              管理后台
            </div>
            <p className="text-sm leading-7 text-adminInkSoft">
              统一管理用户、套餐、Prompt 版本、模型路由和真实微信分发能力。
            </p>
          </div>
          <nav className="space-y-2">
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
          <div className={cn("mt-8", adminAccountCardClassName)}>
            <div className="text-xs uppercase tracking-[0.24em] text-adminInkMuted">默认管理账号</div>
            <div className="mt-3 font-serifCn text-2xl text-adminInk text-balance">huozi</div>
            <p className="mt-2 text-sm leading-6 text-adminInkSoft">
              用于完成首次管理配置；上线前请确保初始密码已安全设置并妥善交接。
            </p>
          </div>
        </aside>
        <main className="bg-adminBg px-6 py-8 md:px-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-adminLineStrong pb-4">
            <div>
              <div className="text-xs uppercase tracking-[0.28em] text-adminInkMuted">Admin Console</div>
              <div className="mt-2 font-serifCn text-2xl text-adminInk text-balance">关键运营能力已接入</div>
            </div>
            <div className="flex items-center gap-3">
              <NotificationCenter
                items={adminNotificationItems}
                triggerClassName={adminNotificationTriggerClassName}
                triggerAriaLabel="打开后台通知中心"
                triggerIcon={<Bell size={16} />}
                title="后台通知中心"
                description="汇总当前后台最需要跟进的能力状态和上线检查。"
              />
              <CommandTrigger
                label="搜索命令"
                icon={<Command size={16} className="text-cinnabar" />}
                className={adminCommandTriggerClassName}
              />
              <div className={adminStatusPillClassName}>
                微信草稿箱推送已接入
              </div>
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
