import assert from "node:assert/strict";
import test from "node:test";

import { buildImaFissionSignalGroups } from "../ima-fission-engine";

test("buildImaFissionSignalGroups surfaces viral directions into reusable signal groups", () => {
  const groups = buildImaFissionSignalGroups({
    hookPatterns: [
      {
        name: "身份错位",
        description: "爆文经常把读者从自认安全的位置里拽出来。",
        triggerPsychology: "触发读者对身份失守和机会错过的焦虑。",
      },
    ],
    viralDirections: [
      {
        direction: "海外赚美金但先补收款坑",
        coreTension: "读者想赚美元，但真正卡住的是收款、税务和平台规则。",
        identityHook: "刚开始接海外客户、还没建好收款路径的人。",
        emotionalTrigger: "害怕订单来了却因为流程不熟而白白流失。",
        transferHint: "迁移到副业赛道时，优先写“看见机会却接不住钱”的瞬间。",
      },
    ],
  });

  assert.equal(groups[0]?.label, "爆点规律");
  assert.ok(groups.some((item) => item.label === "高频题材方向" && item.items[0]?.includes("海外赚美金但先补收款坑")));
  assert.ok(groups.some((item) => item.label === "身份切口" && item.items[0]?.includes("刚开始接海外客户")));
  assert.ok(groups.some((item) => item.label === "迁移提示" && item.items[0]?.includes("副业赛道")));
});
