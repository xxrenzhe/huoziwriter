"use client";

import { Button, buttonStyles, cn, surfaceCardStyles, type ButtonVariant } from "@huoziwriter/ui";
import { Bell, CreditCard, FileText, Megaphone, ShieldCheck, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

export type NotificationCenterItemTone = "default" | "highlight" | "warning" | "success";
export type NotificationCenterItemKind = "system" | "release" | "article" | "billing" | "security" | "review";

export type NotificationCenterAction = {
  id: string;
  label: string;
  href?: string;
  onSelect?: () => void;
  variant?: ButtonVariant;
  closeOnSelect?: boolean;
  disabled?: boolean;
  target?: string;
  rel?: string;
};

export type NotificationCenterItem = {
  id: string;
  title: string;
  description?: string;
  meta?: string;
  timestampLabel?: string;
  badge?: string;
  unread?: boolean;
  tone?: NotificationCenterItemTone;
  kind?: NotificationCenterItemKind;
  href?: string;
  icon?: ReactNode;
  onSelect?: () => void;
  actions?: NotificationCenterAction[];
};

export type NotificationCenterProps = {
  items: NotificationCenterItem[];
  title?: string;
  description?: string;
  triggerAriaLabel?: string;
  triggerText?: string;
  triggerIcon?: ReactNode;
  triggerClassName?: string;
  panelClassName?: string;
  className?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  statusMessage?: string | null;
  unreadCount?: number;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onItemSelect?: (item: NotificationCenterItem) => void;
  onItemAction?: (item: NotificationCenterItem, action: NotificationCenterAction) => void;
  onMarkAllRead?: () => void;
  markAllLabel?: string;
  footer?: ReactNode;
};

const overlayClassName =
  "fixed inset-0 z-[95] flex items-end justify-center bg-[rgba(27,28,26,0.32)] px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-6 backdrop-blur-sm sm:items-start sm:justify-end sm:px-6 sm:pb-6 sm:pt-20";
const panelBaseClassName = cn(
  surfaceCardStyles({ tone: "warm" }),
  "w-full max-w-[30rem] overflow-hidden border-lineStrong bg-surfaceWarm shadow-[0_24px_80px_rgba(27,28,26,0.22)]",
  "max-h-[min(78dvh,44rem)] rounded-[28px] sm:max-h-[min(80vh,46rem)]",
);
const headerClassName =
  "flex items-start gap-3 border-b border-line bg-surface/80 px-4 py-4 sm:px-5";
const bodyClassName = "space-y-3 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4";
const statusCardClassName = cn(
  surfaceCardStyles({ tone: "subtle", padding: "sm" }),
  "border-lineStrong bg-surface text-sm leading-6 text-inkSoft shadow-none",
);
const emptyCardClassName = cn(
  surfaceCardStyles({ tone: "highlight", padding: "lg" }),
  "flex flex-col items-center justify-center gap-3 text-center shadow-none",
);
const footerClassName =
  "border-t border-line bg-surface/80 px-4 py-3 text-sm text-inkMuted sm:px-5";
const triggerBadgeClassName =
  "absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full border border-paper bg-cinnabar px-1.5 text-[11px] font-medium leading-none text-white";
const headerBadgeClassName = cn(
  surfaceCardStyles({ tone: "highlight" }),
  "inline-flex border-lineStrong bg-surface px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-inkMuted shadow-none",
);
const itemCardBaseClassName = cn(
  surfaceCardStyles({ padding: "sm" }),
  "relative overflow-hidden shadow-none transition-colors duration-200",
);
const itemActionButtonBaseClassName = "min-h-0 px-3 py-2 text-xs";

function getFocusableElements(container: HTMLElement | null) {
  if (!container) {
    return [];
  }
  const selector = [
    "a[href]",
    "button:not([disabled])",
    "textarea:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
    (element) =>
      !element.hasAttribute("disabled")
      && element.getAttribute("aria-hidden") !== "true"
      && element.tabIndex !== -1,
  );
}

function getItemTone(item: NotificationCenterItem) {
  if (item.unread && (!item.tone || item.tone === "default")) {
    return "highlight";
  }
  return item.tone ?? "default";
}

function getItemCardClassName(item: NotificationCenterItem) {
  const tone = getItemTone(item);

  if (tone === "warning") {
    return cn(
      itemCardBaseClassName,
      "border-warning/40 bg-surfaceWarning hover:border-warning/60",
    );
  }
  if (tone === "success") {
    return cn(
      itemCardBaseClassName,
      "border-emerald-200 bg-emerald-50/90 hover:border-emerald-300",
    );
  }
  if (tone === "highlight") {
    return cn(
      itemCardBaseClassName,
      "border-lineStrong bg-surfaceWarm hover:border-cinnabar/45 hover:bg-surface",
    );
  }
  return cn(
    itemCardBaseClassName,
    "border-line bg-surface hover:border-cinnabar/35 hover:bg-surfaceHighlight",
  );
}

function getItemIconShellClassName(item: NotificationCenterItem) {
  const tone = getItemTone(item);

  if (tone === "warning") {
    return "flex h-10 w-10 shrink-0 items-center justify-center border border-warning/40 bg-surfaceWarning text-warning";
  }
  if (tone === "success") {
    return "flex h-10 w-10 shrink-0 items-center justify-center border border-emerald-200 bg-emerald-100 text-emerald-700";
  }
  if (tone === "highlight") {
    return "flex h-10 w-10 shrink-0 items-center justify-center border border-lineStrong bg-surfaceWarm text-cinnabar";
  }
  return "flex h-10 w-10 shrink-0 items-center justify-center border border-line bg-surface text-inkMuted";
}

function getItemBadgeClassName(item: NotificationCenterItem) {
  const tone = getItemTone(item);

  if (tone === "warning") {
    return "inline-flex items-center border border-warning/40 bg-surfaceWarning px-2 py-0.5 text-[11px] text-warning";
  }
  if (tone === "success") {
    return "inline-flex items-center border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-700";
  }
  if (tone === "highlight") {
    return "inline-flex items-center border border-lineStrong bg-surfaceWarm px-2 py-0.5 text-[11px] text-cinnabar";
  }
  return "inline-flex items-center border border-line bg-surface px-2 py-0.5 text-[11px] text-inkMuted";
}

function getItemDefaultIcon(kind: NotificationCenterItemKind) {
  if (kind === "article") {
    return <FileText size={18} />;
  }
  if (kind === "billing") {
    return <CreditCard size={18} />;
  }
  if (kind === "security") {
    return <ShieldCheck size={18} />;
  }
  if (kind === "review") {
    return <Sparkles size={18} />;
  }
  if (kind === "release") {
    return <Megaphone size={18} />;
  }
  return <Bell size={18} />;
}

function summarizeUnreadCount(items: NotificationCenterItem[], unreadCount?: number) {
  if (typeof unreadCount === "number") {
    return unreadCount;
  }
  return items.reduce((count, item) => count + (item.unread ? 1 : 0), 0);
}

export function NotificationCenter({
  items,
  title = "通知中心",
  description = "把需要处理的稿件、风控和系统更新集中在一个入口里。",
  triggerAriaLabel = "打开通知中心",
  triggerText,
  triggerIcon,
  triggerClassName,
  panelClassName,
  className,
  emptyTitle = "目前没有新的通知",
  emptyDescription = "系统动态、稿件提醒和关键动作回执会在这里汇总，适合当作统一入口接入 shell。",
  statusMessage,
  unreadCount,
  open,
  defaultOpen = false,
  onOpenChange,
  onItemSelect,
  onItemAction,
  onMarkAllRead,
  markAllLabel = "全部标为已读",
  footer,
}: NotificationCenterProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [liveMessage, setLiveMessage] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const hasOpenedRef = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  const dialogId = useId();

  const isOpen = open ?? uncontrolledOpen;
  const resolvedUnreadCount = summarizeUnreadCount(items, unreadCount);
  const markAllDisabled = resolvedUnreadCount === 0;

  function updateOpen(nextOpen: boolean) {
    if (open === undefined) {
      setUncontrolledOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  }

  function closePanel() {
    updateOpen(false);
  }

  function togglePanel() {
    updateOpen(!isOpen);
  }

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closePanel();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusable = getFocusableElements(dialogRef.current);
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeElement = document.activeElement as HTMLElement | null;

    if (event.shiftKey) {
      if (!activeElement || activeElement === first || !dialogRef.current?.contains(activeElement)) {
        event.preventDefault();
        last.focus();
      }
      return;
    }

    if (!activeElement || activeElement === last || !dialogRef.current?.contains(activeElement)) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleItemActivate(item: NotificationCenterItem) {
    item.onSelect?.();
    onItemSelect?.(item);
    setLiveMessage(`已打开通知：${item.title}`);
    closePanel();
  }

  function handleActionSelect(item: NotificationCenterItem, action: NotificationCenterAction) {
    action.onSelect?.();
    onItemAction?.(item, action);
    setLiveMessage(`已执行操作：${action.label}`);

    if (action.closeOnSelect ?? true) {
      closePanel();
    }
  }

  function handleMarkAllRead() {
    onMarkAllRead?.();
    setLiveMessage("全部通知已标记为已读。");
  }

  useEffect(() => {
    setPortalRoot(document.body);
  }, []);

  useEffect(() => {
    if (statusMessage) {
      setLiveMessage(statusMessage);
    }
  }, [statusMessage]);

  useEffect(() => {
    if (!isOpen) {
      if (hasOpenedRef.current) {
        (previousFocusRef.current ?? triggerRef.current)?.focus();
      }
      return;
    }

    hasOpenedRef.current = true;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setLiveMessage(`通知中心已打开，当前 ${items.length} 条通知，${resolvedUnreadCount} 条未读。`);

    const frame = window.requestAnimationFrame(() => {
      const focusable = getFocusableElements(dialogRef.current);
      (focusable[0] ?? dialogRef.current)?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, items.length, resolvedUnreadCount]);

  const overlay = isOpen && portalRoot
    ? createPortal(
      <div className={overlayClassName}>
        <button
          type="button"
          aria-label="关闭通知中心"
          className="absolute inset-0"
          onClick={closePanel}
        />
        <div
          id={dialogId}
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          tabIndex={-1}
          className={cn(panelBaseClassName, panelClassName)}
          onKeyDown={handleDialogKeyDown}
        >
          <div className={headerClassName}>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center border border-line bg-surface text-cinnabar">
              {triggerIcon ?? <Bell size={18} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id={titleId} className="font-serifCn text-2xl text-ink text-balance">
                  {title}
                </h2>
                <span className={headerBadgeClassName}>
                  {resolvedUnreadCount > 0 ? `${resolvedUnreadCount} 未读` : "全部已读"}
                </span>
              </div>
              <p id={descriptionId} className="mt-2 max-w-md text-sm leading-6 text-inkSoft">
                {description}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {onMarkAllRead ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-0 px-3 py-2 text-inkMuted"
                  disabled={markAllDisabled}
                  onClick={handleMarkAllRead}
                >
                  {markAllLabel}
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                className="h-10 w-10 px-0 py-0 text-inkMuted"
                aria-label="关闭通知中心"
                onClick={closePanel}
              >
                <X size={16} />
              </Button>
            </div>
          </div>

          <div className={bodyClassName}>
            {statusMessage ? (
              <div className={statusCardClassName} role="status" aria-live="polite">
                {statusMessage}
              </div>
            ) : null}

            {items.length === 0 ? (
              <div className={emptyCardClassName}>
                <div className="flex h-12 w-12 items-center justify-center border border-[#dfd2b0] bg-[#fff4e0] text-cinnabar">
                  <Sparkles size={22} />
                </div>
                <div className="space-y-2">
                  <div className="font-medium text-ink">{emptyTitle}</div>
                  <div className="max-w-sm text-sm leading-6 text-inkSoft">{emptyDescription}</div>
                </div>
              </div>
            ) : (
              <ul className="space-y-3" aria-label="通知列表">
                {items.map((item) => {
                  const actionable = Boolean(item.href || item.onSelect || onItemSelect);

                  return (
                    <li key={item.id}>
                      <article className={getItemCardClassName(item)}>
                        <div className="flex items-start gap-3">
                          <div className={getItemIconShellClassName(item)}>
                            {item.icon ?? getItemDefaultIcon(item.kind ?? "system")}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="font-medium text-ink text-balance">{item.title}</div>
                                  {item.badge ? (
                                    <span className={getItemBadgeClassName(item)}>
                                      {item.badge}
                                    </span>
                                  ) : null}
                                  {item.unread ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] text-cinnabar">
                                      <span className="h-2 w-2 rounded-full bg-cinnabar" aria-hidden="true" />
                                      未读
                                    </span>
                                  ) : null}
                                </div>
                                {item.description ? (
                                  <p className="mt-1 text-sm leading-6 text-inkSoft">{item.description}</p>
                                ) : null}
                                {item.meta || item.timestampLabel ? (
                                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.16em] text-inkMuted">
                                    {item.meta ? <span>{item.meta}</span> : null}
                                    {item.meta && item.timestampLabel ? <span aria-hidden="true">•</span> : null}
                                    {item.timestampLabel ? <span>{item.timestampLabel}</span> : null}
                                  </div>
                                ) : null}
                              </div>
                            </div>

                            {actionable ? (
                              item.href ? (
                                <Link
                                  href={item.href}
                                  className="mt-3 inline-flex items-center gap-2 text-sm text-cinnabar transition-colors hover:text-cinnabarDeep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinnabarRing focus-visible:ring-offset-2 focus-visible:ring-offset-surfaceWarm"
                                  onClick={() => handleItemActivate(item)}
                                >
                                  查看详情
                                </Link>
                              ) : (
                                <button
                                  type="button"
                                  className="mt-3 inline-flex items-center gap-2 text-sm text-cinnabar transition-colors hover:text-cinnabarDeep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinnabarRing focus-visible:ring-offset-2 focus-visible:ring-offset-surfaceWarm"
                                  onClick={() => handleItemActivate(item)}
                                >
                                  查看详情
                                </button>
                              )
                            ) : null}
                          </div>
                        </div>

                        {item.actions?.length ? (
                          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                            {item.actions.map((action) => {
                              const variant = action.variant ?? "secondary";
                              const actionClassName = cn(
                                buttonStyles({ variant, size: "sm" }),
                                itemActionButtonBaseClassName,
                              );

                              if (action.href) {
                                return (
                                  <Link
                                    key={action.id}
                                    href={action.href}
                                    target={action.target}
                                    rel={action.rel}
                                    aria-disabled={action.disabled || undefined}
                                    className={cn(
                                      actionClassName,
                                      action.disabled && "pointer-events-none opacity-60",
                                    )}
                                    onClick={() => {
                                      if (!action.disabled) {
                                        handleActionSelect(item, action);
                                      }
                                    }}
                                  >
                                    {action.label}
                                  </Link>
                                );
                              }

                              return (
                                <button
                                  key={action.id}
                                  type="button"
                                  disabled={action.disabled}
                                  className={actionClassName}
                                  onClick={() => handleActionSelect(item, action)}
                                >
                                  {action.label}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </article>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {footer ? <div className={footerClassName}>{footer}</div> : null}
        </div>
      </div>,
      portalRoot,
    )
    : null;

  return (
    <div className={className}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={dialogId}
        aria-label={triggerAriaLabel}
        className={cn(
          buttonStyles({ variant: "secondary", size: "sm" }),
          "relative border-lineStrong hover:border-lineStrong hover:bg-surface",
          triggerText
            ? "min-h-10 px-3 py-2 text-inkSoft"
            : "h-10 w-10 px-0 py-0 text-inkMuted hover:text-inkMuted",
          triggerClassName,
        )}
        onClick={togglePanel}
      >
        {triggerIcon ?? <Bell size={16} />}
        {triggerText ? <span>{triggerText}</span> : <span className="sr-only">{triggerAriaLabel}</span>}
        {resolvedUnreadCount > 0 ? (
          <span className={triggerBadgeClassName}>
            {resolvedUnreadCount > 99 ? "99+" : resolvedUnreadCount}
          </span>
        ) : null}
      </button>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </div>
      {overlay}
    </div>
  );
}
