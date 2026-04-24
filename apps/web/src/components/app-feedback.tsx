"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { Button, buttonStyles, cn, surfaceCardStyles, type ButtonVariant } from "@huoziwriter/ui";

export type AppFeedbackTone = "danger" | "warning" | "success" | "info";

type ToastItem = {
  id: string;
  title: string;
  description?: string;
  tone: AppFeedbackTone;
  durationMs: number;
  actionLabel?: string;
  onAction?: () => void;
};

type ToastInput = Omit<ToastItem, "id" | "durationMs"> & {
  id?: string;
  durationMs?: number;
};

type ToastContextValue = {
  pushToast: (input: ToastInput) => string;
  dismissToast: (id: string) => void;
};

const TOAST_LIMIT = 3;
const DEFAULT_TOAST_DURATION = 4200;
const tonePriority: Record<AppFeedbackTone, number> = {
  danger: 0,
  warning: 1,
  success: 2,
  info: 3,
};

const ToastContext = createContext<ToastContextValue | null>(null);

const viewportClassName =
  "pointer-events-none fixed inset-x-0 top-4 z-[120] mx-auto flex w-[min(100vw-1.5rem,30rem)] flex-col gap-3 sm:right-4 sm:left-auto sm:mx-0";
const toastBaseClassName = cn(
  surfaceCardStyles({ padding: "md" }),
  "pointer-events-auto border-lineStrong bg-surfaceWarm shadow-[0_16px_40px_rgba(27,28,26,0.18)]",
);
const bannerBaseClassName = cn(
  surfaceCardStyles({ padding: "sm" }),
  "text-sm leading-7 shadow-none",
);

function getToneIcon(tone: AppFeedbackTone) {
  if (tone === "danger") return <AlertCircle size={18} />;
  if (tone === "warning") return <TriangleAlert size={18} />;
  if (tone === "success") return <CheckCircle2 size={18} />;
  return <Info size={18} />;
}

function getToastCardClassName(tone: AppFeedbackTone) {
  if (tone === "danger") {
    return cn(toastBaseClassName, "border-danger/40 bg-surface text-danger");
  }
  if (tone === "warning") {
    return cn(toastBaseClassName, "border-warning/40 bg-surfaceWarning text-warning");
  }
  if (tone === "success") {
    return cn(toastBaseClassName, "border-success/30 bg-surfaceSuccess text-emerald-700");
  }
  return cn(toastBaseClassName, "border-lineStrong bg-surfaceWarm text-ink");
}

function getBannerClassName(tone: AppFeedbackTone) {
  if (tone === "danger") {
    return cn(bannerBaseClassName, "border-danger/40 bg-surface text-danger");
  }
  if (tone === "warning") {
    return cn(bannerBaseClassName, "border-warning/40 bg-surfaceWarning text-warning");
  }
  if (tone === "success") {
    return cn(bannerBaseClassName, "border-success/25 bg-surfaceSuccess text-emerald-700");
  }
  return cn(bannerBaseClassName, "border-lineStrong bg-surfaceWarm text-inkSoft");
}

function normalizeToast(input: ToastInput) {
  return {
    id: input.id ?? `toast:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    title: input.title,
    description: input.description,
    tone: input.tone,
    durationMs: Math.max(1200, input.durationMs ?? DEFAULT_TOAST_DURATION),
    actionLabel: input.actionLabel,
    onAction: input.onAction,
  } satisfies ToastItem;
}

function sortToasts(items: ToastItem[]) {
  return [...items].sort((left, right) => {
    const priorityDiff = tonePriority[left.tone] - tonePriority[right.tone];
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    return left.id.localeCompare(right.id, "zh-CN");
  });
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within AppFeedbackProvider");
  }
  return context;
}

export function AppFeedbackProvider({ children }: { children: ReactNode }) {
  const [visibleToasts, setVisibleToasts] = useState<ToastItem[]>([]);
  const queueRef = useRef<ToastItem[]>([]);
  const timersRef = useRef(new Map<string, number>());

  const dismissToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }

    setVisibleToasts((current) => {
      const nextVisible = current.filter((item) => item.id !== id);
      if (nextVisible.length >= TOAST_LIMIT || queueRef.current.length === 0) {
        return nextVisible;
      }
      const [nextQueued, ...remainingQueue] = queueRef.current;
      queueRef.current = remainingQueue;
      return sortToasts([...nextVisible, nextQueued]);
    });
  }, []);

  const pushToast = useCallback((input: ToastInput) => {
    const nextToast = normalizeToast(input);

    setVisibleToasts((current) => {
      const dedupedVisible = current.filter((item) => item.id !== nextToast.id);
      queueRef.current = queueRef.current.filter((item) => item.id !== nextToast.id);
      if (dedupedVisible.length < TOAST_LIMIT) {
        return sortToasts([...dedupedVisible, nextToast]);
      }
      queueRef.current = sortToasts([...queueRef.current, nextToast]);
      return dedupedVisible;
    });

    return nextToast.id;
  }, []);

  useEffect(() => {
    visibleToasts.forEach((toast) => {
      if (timersRef.current.has(toast.id)) {
        return;
      }
      const timer = window.setTimeout(() => {
        dismissToast(toast.id);
      }, toast.durationMs);
      timersRef.current.set(toast.id, timer);
    });

    const visibleIds = new Set(visibleToasts.map((toast) => toast.id));
    Array.from(timersRef.current.entries()).forEach(([id, timer]) => {
      if (!visibleIds.has(id)) {
        window.clearTimeout(timer);
        timersRef.current.delete(id);
      }
    });
  }, [dismissToast, visibleToasts]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current.clear();
      queueRef.current = [];
    };
  }, []);

  const contextValue = useMemo(
    () => ({ pushToast, dismissToast }),
    [dismissToast, pushToast],
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div aria-live="polite" aria-atomic="true" className={viewportClassName}>
        {visibleToasts.map((toast) => (
          <div key={toast.id} className={getToastCardClassName(toast.tone)} role="status">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0">{getToneIcon(toast.tone)}</div>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{toast.title}</div>
                {toast.description ? (
                  <div className="mt-1 text-sm leading-6 opacity-90">{toast.description}</div>
                ) : null}
                {toast.actionLabel && toast.onAction ? (
                  <div className="mt-3">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        toast.onAction?.();
                        dismissToast(toast.id);
                      }}
                    >
                      {toast.actionLabel}
                    </Button>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label="关闭提示"
                className="shrink-0 text-current opacity-70 transition-opacity hover:opacity-100"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function AppBanner({
  tone = "info",
  title,
  description,
  eyebrow,
  actionHref,
  actionLabel,
  actionVariant = "secondary",
  className,
}: {
  tone?: AppFeedbackTone;
  title?: string;
  description: string;
  eyebrow?: string;
  actionHref?: string;
  actionLabel?: string;
  actionVariant?: ButtonVariant;
  className?: string;
}) {
  return (
    <div className={cn(getBannerClassName(tone), className)}>
      {eyebrow ? <div className="text-xs uppercase tracking-[0.18em] opacity-80">{eyebrow}</div> : null}
      {title ? <div className={cn(eyebrow ? "mt-1" : "", "font-medium")}>{title}</div> : null}
      <div className={cn(title || eyebrow ? "mt-1" : "", "text-sm leading-7")}>{description}</div>
      {actionHref && actionLabel ? (
        <div className="mt-3">
          <Link href={actionHref} className={buttonStyles({ variant: actionVariant, size: "sm" })}>
            {actionLabel}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
