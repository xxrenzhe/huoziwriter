"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Bell, Command, Search, Sparkles } from "lucide-react";
import { formatPlanDisplayName } from "@/lib/plan-labels";

type NavItem = {
  href: string;
  label: string;
};

function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-3 text-sm">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`border-b px-1 py-2 transition-colors ${
              active
                ? "border-cinnabar text-cinnabar"
                : "border-transparent text-stone-600 hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MarketingShell({
  items,
  children,
}: {
  items: NavItem[];
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-40 border-b border-[rgba(88,65,64,0.14)] bg-[rgba(250,247,240,0.92)] backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-5">
          <div className="flex items-center gap-4">
            <Link href="/" className="font-sansCn text-lg font-semibold tracking-[0.16em] text-cinnabar">
              HuoZi Writer
            </Link>
            <span className="hidden border-l border-stone-300/70 pl-4 text-xs uppercase tracking-[0.28em] text-stone-500 md:block">
              Neo Chinese Minimalism
            </span>
          </div>
          <div className="flex items-center gap-6">
            <nav className="hidden md:block">
              <NavLinks items={items} />
            </nav>
            <Link
              href="/support?type=business"
              className="border border-cinnabar bg-cinnabar px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cinnabar/90"
            >
              申请试用资格
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-10 md:py-14">{children}</main>
      <footer className="border-t border-[rgba(88,65,64,0.14)] bg-[rgba(250,247,240,0.92)]">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-6 text-sm text-stone-600 md:flex-row md:items-center md:justify-between">
          <div>HuoZi Writer · 运营后台发号制写作 SaaS</div>
          <div className="flex flex-wrap gap-4">
            <Link href="/manifesto" className="hover:text-ink">宣言</Link>
            <Link href="/support" className="hover:text-ink">支持</Link>
            <Link href="/terms" className="hover:text-ink">服务条款</Link>
            <Link href="/privacy" className="hover:text-ink">隐私协议</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function WorkspaceShell({
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
  const displayPlanName = formatPlanDisplayName(currentPlanName);
  const usageText = usageLimit == null ? `${currentUsage} / 不限` : `${currentUsage} / ${usageLimit}`;
  const usageWidth = usageLimit == null ? 40 : Math.max(8, Math.min(100, Math.round((currentUsage / Math.max(usageLimit, 1)) * 100)));
  const currentSection =
    items.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))?.label ?? "作战台";

  return (
    <div className="min-h-screen bg-stonebase text-ink">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[88px_260px_minmax(0,1fr)]">
        <aside className="hidden border-r border-stone-300/25 bg-[#efe9dd] px-5 py-8 lg:block">
          <div className="space-y-10">
            <div className="font-sansCn text-sm font-semibold tracking-[0.24em] text-cinnabar">
              HuoZi
            </div>
            <div className="space-y-4 text-stone-500">
              <div className="flex h-11 w-11 items-center justify-center border border-stone-300/70 bg-white">
                <Sparkles size={18} />
              </div>
              <div className="flex h-11 w-11 items-center justify-center border border-stone-300/70 bg-white">
                <Search size={18} />
              </div>
              <div className="flex h-11 w-11 items-center justify-center border border-stone-300/70 bg-white">
                <Command size={18} />
              </div>
            </div>
          </div>
        </aside>
        <aside className="border-r border-stone-300/20 bg-panel px-5 py-8">
          <div className="mb-8 border-b border-stone-300/40 pb-6">
            <div className="font-sansCn text-xs uppercase tracking-[0.3em] text-stone-500">主工作流</div>
            <div className="mt-3 font-serifCn text-3xl font-semibold">公众号爆款写作系统</div>
            <p className="mt-3 text-sm leading-7 text-stone-600">
              把今天值得写的题、正在推进的稿件和结果回流收进作战台、稿件区与复盘主链路。
            </p>
          </div>
          <nav className="space-y-2">
            {items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block border px-3 py-3 text-sm transition-colors ${
                    active
                      ? "border-cinnabar bg-cinnabar text-white"
                      : "border-transparent text-stone-700 hover:border-stone-300/60 hover:bg-white hover:text-ink"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-8 space-y-3 border-t border-stone-300/40 pt-6">
            <div className="text-xs uppercase tracking-[0.28em] text-stone-500">当前配额</div>
            <div className="border border-stone-300/70 bg-white p-4">
              <div className="text-sm text-stone-600">{displayPlanName}</div>
              <div className="mt-3 flex items-end justify-between">
                <div className="font-serifCn text-3xl text-ink">{usageText}</div>
                <div className="text-xs text-stone-500">今日生成</div>
              </div>
              <div className="mt-4 h-2 overflow-hidden border border-stone-200 bg-[#f4efe6]">
                <div className="h-full bg-cinnabar" style={{ width: `${usageWidth}%` }} />
              </div>
            </div>
          </div>
        </aside>
        <main className="bg-paper px-6 py-8 md:px-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-stone-300/25 pb-4">
            <div>
              <div className="text-xs uppercase tracking-[0.28em] text-stone-500">{currentSection}</div>
              <div className="mt-2 font-serifCn text-2xl">{statusHeadline}</div>
              <div className="mt-2 text-sm leading-7 text-stone-600">{statusDetail}</div>
            </div>
            <div className="flex items-center gap-3 text-stone-500">
              <div className="hidden items-center gap-2 border border-stone-300/60 bg-white px-3 py-2 text-sm md:flex">
                <Search size={16} />
                搜索素材、稿件、选题
              </div>
              <button className="flex h-10 w-10 items-center justify-center border border-stone-300/60 bg-white">
                <Bell size={16} />
              </button>
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
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

  return (
    <div className="min-h-screen bg-[#111111] text-stone-100">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="bg-[#161616] px-6 py-8">
          <div className="mb-8 space-y-2 border-b border-stone-800 pb-6">
            <div className="font-sansCn text-xs uppercase tracking-[0.25em] text-stone-500">
              HuoZi Writer
            </div>
            <div className="font-serifCn text-3xl font-semibold text-stone-100">
              管理后台
            </div>
            <p className="text-sm leading-7 text-stone-400">
              统一管理用户、套餐、Prompt 版本、模型路由和真实微信分发能力。
            </p>
          </div>
          <nav className="space-y-2">
            {items.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block border px-3 py-3 text-sm transition-colors ${
                    active
                      ? "border-cinnabar bg-cinnabar text-white"
                      : "border-transparent text-stone-400 hover:border-stone-800 hover:bg-stone-900 hover:text-stone-100"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-8 border border-stone-800 bg-stone-950 p-4">
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">默认管理账号</div>
            <div className="mt-3 font-serifCn text-2xl text-stone-100">huozi</div>
            <p className="mt-2 text-sm leading-6 text-stone-400">
              首次启动由初始化脚本注入，启动前需先配置 `DEFAULT_ADMIN_PASSWORD`。
            </p>
          </div>
        </aside>
        <main className="bg-[#121212] px-6 py-8 md:px-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-stone-800 pb-4">
            <div>
              <div className="text-xs uppercase tracking-[0.28em] text-stone-500">Admin Console</div>
              <div className="mt-2 font-serifCn text-2xl text-stone-100">系统当前处于可上线骨架阶段</div>
            </div>
            <div className="border border-stone-800 bg-stone-950 px-4 py-2 text-sm text-stone-300">
              微信草稿箱真实推送已纳入 v1
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
