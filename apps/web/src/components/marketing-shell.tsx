"use client";

import { Button, buttonStyles, cn } from "@huoziwriter/ui";
import { Command, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useCommandMenu } from "@/components/command-menu";

type NavItem = {
  href: string;
  label: string;
};

const marketingChromeClassName = "border-[rgba(88,65,64,0.14)] bg-[rgba(250,247,240,0.92)]";
const marketingHeaderClassName = cn("sticky top-0 z-40 border-b backdrop-blur-md", marketingChromeClassName);
const marketingFooterClassName = cn("border-t", marketingChromeClassName);
const marketingCommandTriggerClassName = cn(
  buttonStyles({ variant: "secondary", size: "sm" }),
  "hidden min-h-0 border-lineStrong px-3 py-2 text-inkSoft md:flex",
);
const marketingMobileMenuButtonClassName = cn(
  buttonStyles({ variant: "secondary", size: "sm" }),
  "h-10 w-10 min-h-0 border-lineStrong px-0 py-0 text-inkSoft md:hidden",
);
const marketingPrimaryActionClassName = cn(
  buttonStyles({ variant: "primary", size: "sm" }),
  "min-h-0 px-4 py-2",
);
const marketingMobilePanelOverlayClassName = "fixed inset-0 z-50 bg-[rgba(27,28,26,0.34)] backdrop-blur-sm md:hidden";
const marketingMobilePanelClassName = cn(
  "fixed inset-x-0 top-0 z-[51] border-b px-6 pb-6 pt-5 shadow-[0_20px_60px_rgba(27,28,26,0.18)] md:hidden",
  marketingChromeClassName,
);
const marketingFooterLinkClassName = "transition-colors hover:text-ink";
const marketingFooterLinks = [
  { href: "/manifesto", label: "宣言" },
  { href: "/support", label: "支持" },
  { href: "/terms", label: "服务条款" },
  { href: "/privacy", label: "隐私协议" },
] as const;

function normalizeShellHref(href: string) {
  if (href === "/dashboard") return "/warroom";
  if (href === "/review") return "/reviews";
  return href;
}

function isShellPathActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function marketingNavLinkClassName(active: boolean) {
  return cn(
    "border-b px-1 py-2 transition-colors",
    active
      ? "border-cinnabar text-cinnabar"
      : "border-transparent text-inkMuted hover:text-ink",
  );
}

function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-3 text-sm">
      {items.map((item) => {
        const href = normalizeShellHref(item.href);
        const active = isShellPathActive(pathname, href);
        return (
          <Link
            key={item.href}
            href={href}
            className={marketingNavLinkClassName(active)}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function CommandTrigger({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  const { openMenu } = useCommandMenu();

  return (
    <Button
      type="button"
      onClick={openMenu}
      className={className}
      iconLeft={<Command size={16} className="text-cinnabar" />}
    >
      <span>{label}</span>
    </Button>
  );
}

export function MarketingShell({
  items,
  children,
}: {
  items: NavItem[];
  children: ReactNode;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!mobileMenuOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileMenuOpen]);

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header
        data-command-chrome="true"
        className={marketingHeaderClassName}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-5">
          <div className="flex items-center gap-4">
            <Link href="/" className="font-sansCn text-lg font-semibold tracking-[0.16em] text-cinnabar">
              HuoZi Writer
            </Link>
            <span className="hidden border-l border-lineStrong pl-4 text-xs uppercase tracking-[0.28em] text-inkMuted md:block">
              Neo Chinese Minimalism
            </span>
          </div>
          <div className="flex items-center gap-6">
            <nav className="hidden md:block">
              <NavLinks items={items} />
            </nav>
            <CommandTrigger
              label="搜索命令"
              className={marketingCommandTriggerClassName}
            />
            <button
              type="button"
              aria-label={mobileMenuOpen ? "关闭导航菜单" : "打开导航菜单"}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((current) => !current)}
              className={marketingMobileMenuButtonClassName}
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <Link
              href="/support?type=business"
              className={cn(marketingPrimaryActionClassName, "hidden sm:inline-flex")}
            >
              申请试用资格
            </Link>
          </div>
        </div>
      </header>
      {mobileMenuOpen ? (
        <>
          <button
            type="button"
            aria-label="关闭导航菜单"
            className={marketingMobilePanelOverlayClassName}
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className={marketingMobilePanelClassName}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-sansCn text-lg font-semibold tracking-[0.16em] text-cinnabar">HuoZi Writer</div>
                <div className="mt-2 text-sm leading-7 text-inkSoft">
                  公开站导航、支持入口和命令检索都集中在这里，手机上不再缺失主导航。
                </div>
              </div>
              <button
                type="button"
                aria-label="关闭导航菜单"
                onClick={() => setMobileMenuOpen(false)}
                className={marketingMobileMenuButtonClassName}
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-5 grid gap-3">
              {items.map((item) => {
                const href = normalizeShellHref(item.href);
                return (
                  <Link
                    key={item.href}
                    href={href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      buttonStyles({ variant: "secondary", size: "md", fullWidth: true }),
                      "justify-start border-lineStrong bg-surface text-ink",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <CommandTrigger
                label="搜索命令"
                className={cn(
                  buttonStyles({ variant: "secondary", size: "md", fullWidth: true }),
                  "justify-center border-lineStrong text-inkSoft",
                )}
              />
              <Link
                href="/support?type=business"
                onClick={() => setMobileMenuOpen(false)}
                className={cn(marketingPrimaryActionClassName, "justify-center")}
              >
                申请试用资格
              </Link>
            </div>
          </div>
        </>
      ) : null}
      <main className="mx-auto max-w-7xl px-6 py-10 md:py-14">{children}</main>
      <footer
        data-command-chrome="true"
        className={marketingFooterClassName}
      >
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-6 text-sm text-inkMuted md:flex-row md:items-center md:justify-between">
          <div>HuoZi Writer · 邀请开通制写作 SaaS</div>
          <div className="flex flex-wrap gap-4">
            {marketingFooterLinks.map((item) => (
              <Link key={item.href} href={item.href} className={marketingFooterLinkClassName}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
