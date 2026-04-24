import type { CommandAction, CommandItem } from "./command-registry";

export const RECENT_COMMAND_STORAGE_KEY = "huoziwriter.command-menu.recent";
const RECENT_COMMAND_LIMIT = 6;

export type RecentCommandItem = {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  keywords?: string[];
  action: CommandAction;
  originGroup: string;
};

function isSupportedAction(action: unknown): action is CommandAction {
  if (!action || typeof action !== "object") {
    return false;
  }
  const type = String((action as { type?: unknown }).type || "").trim();
  if (type === "toggle-theme" || type === "toggle-focus") {
    return true;
  }
  return type === "navigate" && typeof (action as { href?: unknown }).href === "string";
}

export function toRecentCommandItem(item: CommandItem): RecentCommandItem {
  return {
    id: item.id,
    title: item.title,
    subtitle: item.subtitle,
    badge: item.badge,
    keywords: item.keywords,
    action: item.action,
    originGroup: item.group,
  };
}

export function mergeRecentCommandItems(
  currentItems: RecentCommandItem[],
  nextItem: RecentCommandItem,
  limit = RECENT_COMMAND_LIMIT,
) {
  const normalizedLimit = Math.max(1, Math.min(20, Math.round(limit)));
  const items = [nextItem, ...currentItems.filter((item) => item.id !== nextItem.id)];
  return items.slice(0, normalizedLimit);
}

export function parseRecentCommandItems(raw: string | null | undefined) {
  if (!raw) {
    return [] as RecentCommandItem[];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [] as RecentCommandItem[];
    }
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") {
        return [];
      }
      const item = entry as Record<string, unknown>;
      const id = String(item.id || "").trim();
      const title = String(item.title || "").trim();
      if (!id || !title || !isSupportedAction(item.action)) {
        return [];
      }
      return [{
        id,
        title,
        subtitle: String(item.subtitle || "").trim() || undefined,
        badge: String(item.badge || "").trim() || undefined,
        keywords: Array.isArray(item.keywords)
          ? item.keywords.map((keyword) => String(keyword || "").trim()).filter(Boolean)
          : undefined,
        action: item.action,
        originGroup: String(item.originGroup || "").trim() || "命令",
      } satisfies RecentCommandItem];
    });
  } catch {
    return [] as RecentCommandItem[];
  }
}
