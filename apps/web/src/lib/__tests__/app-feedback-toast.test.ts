import assert from "node:assert/strict";
import test from "node:test";

type Tone = "danger" | "warning" | "success" | "info";

function rankTone(tone: Tone) {
  if (tone === "danger") return 0;
  if (tone === "warning") return 1;
  if (tone === "success") return 2;
  return 3;
}

function sortToasts(items: Array<{ id: string; tone: Tone }>) {
  return [...items].sort((left, right) => {
    const priorityDiff = rankTone(left.tone) - rankTone(right.tone);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    return left.id.localeCompare(right.id, "zh-CN");
  });
}

test("toast priority sorts danger before warning before success before info", () => {
  const result = sortToasts([
    { id: "4", tone: "info" },
    { id: "2", tone: "warning" },
    { id: "3", tone: "success" },
    { id: "1", tone: "danger" },
  ]);

  assert.deepEqual(result.map((item) => item.tone), ["danger", "warning", "success", "info"]);
});

test("toast queue can keep visible limit at three", () => {
  const visible = sortToasts([
    { id: "t1", tone: "success" },
    { id: "t2", tone: "danger" },
    { id: "t3", tone: "info" },
    { id: "t4", tone: "warning" },
  ]).slice(0, 3);

  assert.equal(visible.length, 3);
  assert.deepEqual(visible.map((item) => item.id), ["t2", "t4", "t1"]);
});
