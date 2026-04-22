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
      id: "admin-release",
      title: "命令中心已覆盖管理后台",
      description: "可直接通过顶部入口搜索模块、跳转页面和触发常用动作。",
      kind: "release",
      tone: "highlight",
      unread: true,
      meta: "后台体验",
      actions: [
        {
          id: "admin-open-command",
          label: "立即打开",
          variant: "secondary",
          onSelect: openMenu,
        },
      ],
    },
    {
      id: "admin-writing-eval",
      title: "写作评测与业务总览已并入主导航",
      description: "评测、财务和业务总览都已进入统一后台信息架构，适合继续补移动端卡片 fallback。",
      kind: "review",
      meta: "结构升级",
      href: "/admin/writing-eval",
    },
    {
      id: "admin-security",
      title: "默认管理员账号需要上线前确认",
      description: "启动前仍需配置 `DEFAULT_ADMIN_PASSWORD`，避免默认口令进入可部署环境。",
      kind: "security",
      tone: "warning",
      meta: "上线检查",
      href: "/admin/audit",
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
}: {
  items: NavItem[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { openMenu } = useCommandMenu();
  const normalizedItems = normalizeShellItems(items);
  const adminNotificationItems = buildAdminNotificationItems({ openMenu });

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
              首次启动由初始化脚本注入，启动前需先配置 `DEFAULT_ADMIN_PASSWORD`。
            </p>
          </div>
        </aside>
        <main className="bg-adminBg px-6 py-8 md:px-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-adminLineStrong pb-4">
            <div>
              <div className="text-xs uppercase tracking-[0.28em] text-adminInkMuted">Admin Console</div>
              <div className="mt-2 font-serifCn text-2xl text-adminInk text-balance">系统当前处于可上线骨架阶段</div>
            </div>
            <div className="flex items-center gap-3">
              <NotificationCenter
                items={adminNotificationItems}
                triggerClassName={adminNotificationTriggerClassName}
                triggerAriaLabel="打开后台通知中心"
                triggerIcon={<Bell size={16} />}
                title="后台通知中心"
                description="汇总当前后台骨架阶段最需要跟进的能力接线和上线检查。"
              />
              <CommandTrigger
                label="搜索命令"
                icon={<Command size={16} className="text-cinnabar" />}
                className={adminCommandTriggerClassName}
              />
              <div className={adminStatusPillClassName}>
                微信草稿箱真实推送已纳入 v1
              </div>
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
