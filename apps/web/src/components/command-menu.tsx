"use client";

import { buttonStyles, cn, surfaceCardStyles } from "@huoziwriter/ui";
import {
  createContext,
  startTransition,
  useContext,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import { Command, Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useToast } from "@/components/app-feedback";
import { filterCommandItems, getStaticCommandItems, searchRemoteCommandSources, type CommandAction, type CommandItem } from "@/lib/command-registry";
import {
  mergeRecentCommandItems,
  parseRecentCommandItems,
  RECENT_COMMAND_STORAGE_KEY,
  toRecentCommandItem,
  type RecentCommandItem,
} from "@/lib/command-menu-recent";

export type ThemeMode = "day" | "night";

type CommandMenuContextValue = {
  openMenu: () => void;
  closeMenu: () => void;
  theme: ThemeMode;
  focusMode: boolean;
  toggleTheme: () => void;
  toggleFocusMode: () => void;
};

const CommandMenuContext = createContext<CommandMenuContextValue | null>(null);

const THEME_STORAGE_KEY = "huoziwriter.ui-theme";
const FOCUS_STORAGE_KEY = "huoziwriter.focus-mode";

const commandMenuOverlayClassName = "fixed inset-0 z-[90] pointer-events-auto opacity-100 transition";
const commandMenuScrimClassName = "absolute inset-0 bg-[rgba(27,28,26,0.48)] backdrop-blur-sm";
const commandMenuDialogClassName = cn(
  surfaceCardStyles({ tone: "warm" }),
  "relative mx-auto mt-6 flex max-h-[min(80vh,720px)] w-[min(880px,calc(100vw-2rem))] flex-col overflow-hidden bg-surfaceWarm shadow-[0_24px_80px_rgba(27,28,26,0.28)]",
);
const commandMenuHeaderClassName = "flex items-start gap-3 border-b border-line px-4 py-4";
const commandMenuHeaderContentClassName = "min-w-0 flex-1";
const commandMenuInputClassName = "w-full border-0 bg-transparent text-base text-ink outline-none placeholder:text-inkFaint";
const commandMenuHeaderHintClassName = "mt-2 text-xs leading-6 text-inkMuted";
const commandMenuBodyClassName = "max-h-[60vh] overflow-y-auto p-2";
const commandMenuGroupClassName = "pb-3";
const commandMenuGroupLabelClassName = "px-3 py-2 text-[11px] uppercase tracking-[0.24em] text-inkFaint";
const commandMenuGroupItemsClassName = "space-y-1";
const commandMenuBadgeClassName = cn(
  surfaceCardStyles({ tone: "warm" }),
  "border-lineStrong bg-surfaceWarm px-2 py-0.5 text-[11px] text-inkMuted shadow-none",
);
const commandMenuItemBaseClassName = cn(
  buttonStyles({ variant: "ghost", size: "md", fullWidth: true }),
  "min-h-0 items-start justify-between gap-4 whitespace-normal px-3 py-3 text-left font-normal text-ink shadow-none",
);
const commandMenuEmptyStateCardClassName = cn(
  surfaceCardStyles({ tone: "highlight", padding: "md" }),
  "mx-2 my-2 flex min-h-56 flex-col items-center justify-center gap-3 text-center text-inkMuted shadow-none",
);
const commandMenuStatusCardClassName = cn(
  surfaceCardStyles({ tone: "subtle", padding: "sm" }),
  "mx-2 my-2 text-sm text-inkSoft shadow-none",
);
const commandMenuErrorCardClassName = cn(
  surfaceCardStyles({ tone: "warning", padding: "sm" }),
  "mx-2 my-2 text-sm text-warning shadow-none",
);
const commandMenuFooterClassName = cn(
  surfaceCardStyles(),
  "flex flex-wrap items-center justify-between gap-3 border-x-0 border-b-0 border-t border-line bg-surface px-4 py-3 text-xs text-inkMuted shadow-none",
);

function commandMenuItemClassName(active: boolean) {
  return cn(
    commandMenuItemBaseClassName,
    active
      ? "border-cinnabar bg-surface shadow-ink hover:border-cinnabar hover:bg-surface"
      : "border-transparent bg-transparent hover:border-lineStrong hover:bg-surfaceHighlight",
  );
}

function clampIndex(index: number, length: number) {
  if (length <= 0) {
    return -1;
  }
  if (index < 0) {
    return length - 1;
  }
  if (index >= length) {
    return 0;
  }
  return index;
}

function buildGroupedItems(items: CommandItem[]) {
  const groups: Array<{ label: string; items: Array<{ item: CommandItem; index: number }> }> = [];
  const groupMap = new Map<string, Array<{ item: CommandItem; index: number }>>();
  let index = 0;

  for (const item of items) {
    const groupItems = groupMap.get(item.group);
    const entry = { item, index };
    if (groupItems) {
      groupItems.push(entry);
    } else {
      const nextGroup = [entry];
      groupMap.set(item.group, nextGroup);
      groups.push({ label: item.group, items: nextGroup });
    }
    index += 1;
  }

  return groups;
}

function buildRecentCommandItems(items: RecentCommandItem[], query: string) {
  return filterCommandItems(
    items.map((item) => ({
      ...item,
      group: "最近",
      subtitle: item.subtitle || item.originGroup,
    })),
    query,
  );
}

function dedupeCommandItems(items: CommandItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

function applyTheme(mode: ThemeMode) {
  document.documentElement.dataset.uiTheme = mode;
}

function applyFocusMode(enabled: boolean) {
  document.documentElement.dataset.focusMode = enabled ? "1" : "0";
}

export function useCommandMenu() {
  const context = useContext(CommandMenuContext);
  if (!context) {
    throw new Error("useCommandMenu must be used within CommandMenuProvider");
  }
  return context;
}

export function CommandMenuProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { pushToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [remoteItems, setRemoteItems] = useState<CommandItem[]>([]);
  const [recentItems, setRecentItems] = useState<RecentCommandItem[]>([]);
  const [remotePending, setRemotePending] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [theme, setTheme] = useState<ThemeMode>("day");
  const [focusMode, setFocusMode] = useState(false);

  const staticItems = filterCommandItems(getStaticCommandItems(pathname), query);
  const recentCommandItems = buildRecentCommandItems(recentItems, query);
  const visibleItems = dedupeCommandItems([...recentCommandItems, ...staticItems, ...remoteItems]);
  const groupedItems = buildGroupedItems(visibleItems);

  function closeMenu() {
    setOpen(false);
    setQuery("");
    setRemoteItems([]);
    setRemotePending(false);
    setRemoteError(null);
    setActiveIndex(-1);
  }

  function openMenu() {
    setOpen(true);
  }

  function toggleTheme() {
    const nextTheme = theme === "night" ? "day" : "night";
    setTheme(nextTheme);
    applyTheme(nextTheme);
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    pushToast({
      tone: "success",
      title: nextTheme === "night" ? "已切到夜读模式" : "已切到日间模式",
      description: "主题切换已生效，后续页面会沿用当前阅读模式。",
    });
  }

  function toggleFocusMode() {
    const nextValue = !focusMode;
    setFocusMode(nextValue);
    applyFocusMode(nextValue);
    localStorage.setItem(FOCUS_STORAGE_KEY, nextValue ? "1" : "0");
    pushToast({
      tone: nextValue ? "info" : "success",
      title: nextValue ? "已进入专注模式" : "已退出专注模式",
      description: nextValue ? "页面 chrome 已收起，适合继续沉浸编辑。" : "导航与辅助入口已恢复显示。",
    });
    if (nextValue) {
      const requestFullscreen = document.documentElement.requestFullscreen;
      if (requestFullscreen) {
        requestFullscreen.call(document.documentElement).catch(() => {
          pushToast({
            tone: "warning",
            title: "浏览器未进入全屏",
            description: "专注模式已开启，但当前环境拒绝了全屏请求。",
          });
        });
      }
    } else if (document.fullscreenElement) {
      const exitFullscreen = document.exitFullscreen;
      if (exitFullscreen) {
        exitFullscreen.call(document).catch(() => {});
      }
    }
  }

  function executeAction(action: CommandAction) {
    if (action.type === "navigate") {
      closeMenu();
      router.push(action.href);
      return;
    }
    if (action.type === "toggle-theme") {
      toggleTheme();
      closeMenu();
      return;
    }
    toggleFocusMode();
    closeMenu();
  }

  function activateItem(item: CommandItem | undefined) {
    if (!item) {
      return;
    }
    try {
      const nextRecentItems = mergeRecentCommandItems(recentItems, toRecentCommandItem(item));
      setRecentItems(nextRecentItems);
      localStorage.setItem(RECENT_COMMAND_STORAGE_KEY, JSON.stringify(nextRecentItems));
    } catch {}
    executeAction(item.action);
  }

  useEffect(() => {
    const initialTheme = localStorage.getItem(THEME_STORAGE_KEY) === "night" ? "night" : "day";
    const initialFocusMode = localStorage.getItem(FOCUS_STORAGE_KEY) === "1";
    const initialRecentItems = parseRecentCommandItems(localStorage.getItem(RECENT_COMMAND_STORAGE_KEY));
    setTheme(initialTheme);
    setFocusMode(initialFocusMode);
    setRecentItems(initialRecentItems);
    applyTheme(initialTheme);
    applyFocusMode(initialFocusMode);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
        return;
      }
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setActiveIndex(-1);
      return;
    }
    setActiveIndex((current) => clampIndex(current < 0 ? 0 : current, visibleItems.length));
  }, [open, visibleItems.length]);

  useEffect(() => {
    if (!open) {
      setRemoteItems([]);
      setRemotePending(false);
      setRemoteError(null);
      return;
    }
    const trimmedQuery = deferredQuery.trim();
    if (!trimmedQuery) {
      setRemoteItems([]);
      setRemotePending(false);
      setRemoteError(null);
      return;
    }
    const controller = new AbortController();
    setRemotePending(true);
    setRemoteError(null);
    searchRemoteCommandSources(trimmedQuery, controller.signal)
      .then((items) => {
        if (controller.signal.aborted) {
          return;
        }
        startTransition(() => {
          setRemoteItems(items);
        });
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }
        setRemoteItems([]);
        setRemoteError(error instanceof Error ? error.message : "搜索失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setRemotePending(false);
        }
      });
    return () => {
      controller.abort();
    };
  }, [open, deferredQuery]);

  return (
    <CommandMenuContext.Provider value={{ openMenu, closeMenu, theme, focusMode, toggleTheme, toggleFocusMode }}>
      {children}
      {open ? (
        <div className={commandMenuOverlayClassName}>
          <button
            type="button"
            aria-label="关闭命令菜单"
            className={commandMenuScrimClassName}
            onClick={closeMenu}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="命令菜单"
            className={commandMenuDialogClassName}
          >
            <div className={commandMenuHeaderClassName}>
              <Search size={18} className="text-inkFaint" />
              <div className={commandMenuHeaderContentClassName}>
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setActiveIndex((current) => clampIndex(current + 1, visibleItems.length));
                      return;
                    }
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setActiveIndex((current) => clampIndex(current - 1, visibleItems.length));
                      return;
                    }
                    if (event.key === "Enter") {
                      event.preventDefault();
                      activateItem(visibleItems[activeIndex] ?? visibleItems[0]);
                      return;
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      closeMenu();
                    }
                  }}
                  placeholder="搜索命令、稿件、素材、打法"
                  className={commandMenuInputClassName}
                />
                <div className={commandMenuHeaderHintClassName}>
                  ⌘/Ctrl + K 打开；支持最近访问、稿件标题、素材关键词、打法标签和主题命令。
                </div>
              </div>
            </div>
            <div className={commandMenuBodyClassName}>
              {groupedItems.length > 0 ? (
                groupedItems.map((group) => (
                  <section key={group.label} className={commandMenuGroupClassName}>
                    <div className={commandMenuGroupLabelClassName}>{group.label}</div>
                    <div className={commandMenuGroupItemsClassName}>
                      {group.items.map(({ item, index }) => (
                        <button
                          key={item.id}
                          type="button"
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => activateItem(item)}
                          className={commandMenuItemClassName(index === activeIndex)}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="font-medium text-ink">{item.title}</div>
                              {item.badge ? (
                                <span className={commandMenuBadgeClassName}>
                                  {item.badge}
                                </span>
                              ) : null}
                            </div>
                            {item.subtitle ? (
                              <div className="mt-1 line-clamp-2 text-sm leading-6 text-inkMuted">{item.subtitle}</div>
                            ) : null}
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                ))
              ) : (
                <div className={commandMenuEmptyStateCardClassName}>
                  <Command size={26} />
                  <div className="font-medium text-ink">还没有匹配结果</div>
                  <div className="max-w-md text-sm leading-6">
                    先试试输入稿件标题、素材关键词、打法标签，或者直接执行导航和主题类命令。
                  </div>
                </div>
              )}
              {remotePending ? (
                <div className={commandMenuStatusCardClassName}>正在搜索稿件、素材和打法…</div>
              ) : null}
              {remoteError ? (
                <div className={commandMenuErrorCardClassName}>{remoteError}</div>
              ) : null}
            </div>
            <div className={commandMenuFooterClassName}>
              <div>支持点击或键盘上下选择，回车执行当前结果。</div>
              <div>{theme === "night" ? "当前主题：夜读" : "当前主题：日间"} · {focusMode ? "沉浸模式：已开启" : "沉浸模式：未开启"}</div>
            </div>
          </div>
        </div>
      ) : null}
    </CommandMenuContext.Provider>
  );
}
