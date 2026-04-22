"use client";

import { Button, buttonStyles, cn } from "@huoziwriter/ui";
import { Command } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
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
const marketingPrimaryActionClassName = cn(
  buttonStyles({ variant: "primary", size: "sm" }),
  "min-h-0 px-4 py-2",
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
            <Link
              href="/support?type=business"
              className={marketingPrimaryActionClassName}
            >
              申请试用资格
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-10 md:py-14">{children}</main>
      <footer
        data-command-chrome="true"
        className={marketingFooterClassName}
      >
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-6 text-sm text-inkMuted md:flex-row md:items-center md:justify-between">
          <div>HuoZi Writer · 运营后台发号制写作 SaaS</div>
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
