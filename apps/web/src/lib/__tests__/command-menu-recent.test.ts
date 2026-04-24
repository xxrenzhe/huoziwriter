import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeRecentCommandItems,
  parseRecentCommandItems,
  toRecentCommandItem,
} from "../command-menu-recent";
import type { CommandItem } from "../command-registry";

function buildItem(input: Partial<CommandItem> = {}): CommandItem {
  return {
    id: input.id ?? "nav:/warroom",
    group: input.group ?? "工作区导航",
    title: input.title ?? "作战台",
    subtitle: input.subtitle ?? "进入 warroom",
    badge: input.badge,
    keywords: input.keywords ?? ["warroom"],
    action: input.action ?? { type: "navigate", href: "/warroom" },
  };
}

test("mergeRecentCommandItems keeps latest item first and removes duplicates", () => {
  const current = [
    toRecentCommandItem(buildItem({ id: "nav:/articles", title: "稿件", action: { type: "navigate", href: "/articles" } })),
    toRecentCommandItem(buildItem({ id: "nav:/warroom", title: "作战台", action: { type: "navigate", href: "/warroom" } })),
  ];

  const next = mergeRecentCommandItems(
    current,
    toRecentCommandItem(buildItem({ id: "nav:/warroom", title: "作战台", action: { type: "navigate", href: "/warroom" } })),
  );

  assert.deepEqual(next.map((item) => item.id), ["nav:/warroom", "nav:/articles"]);
});

test("parseRecentCommandItems ignores malformed entries and keeps supported actions", () => {
  const parsed = parseRecentCommandItems(JSON.stringify([
    {
      id: "nav:/reviews",
      title: "复盘",
      originGroup: "工作区导航",
      action: { type: "navigate", href: "/reviews" },
    },
    {
      id: "broken",
      title: "",
      action: { type: "navigate", href: "/broken" },
    },
    {
      id: "unsupported",
      title: "bad",
      action: { type: "custom", href: "/bad" },
    },
  ]));

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.id, "nav:/reviews");
  assert.equal(parsed[0]?.action.type, "navigate");
});
