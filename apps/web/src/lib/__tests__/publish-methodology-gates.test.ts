import assert from "node:assert/strict";
import test from "node:test";

import { buildPublishMethodologyGates } from "../publish-methodology-gates";

test("buildPublishMethodologyGates aggregates plan17 six-gate summary from publish checks", () => {
  const gates = buildPublishMethodologyGates([
    {
      key: "researchSourceCoverage",
      label: "研究信源覆盖",
      status: "blocked",
      detail: "研究层还缺时间线与用户信源。",
      targetStageCode: "researchBrief",
      actionLabel: "去补研究信源",
    },
    {
      key: "evidencePackage",
      label: "证据包",
      status: "passed",
      detail: "证据包已确认，共 4 条。",
    },
    {
      key: "hookCoverage",
      label: "爆点覆盖度",
      status: "warning",
      detail: "当前只覆盖 1 类爆点标签。",
      targetStageCode: "evidence",
      actionLabel: "去补爆点标签",
    },
    {
      key: "fourPointAudit",
      label: "策略卡四元强度",
      status: "passed",
      detail: "四元强度已过线。",
    },
    {
      key: "archetypeRhythmConsistency",
      label: "原型节奏一致性",
      status: "warning",
      detail: "执行卡和策略原型还没完全对齐。",
      targetStageCode: "deepWriting",
      actionLabel: "去校准执行卡",
    },
  ]);

  assert.equal(gates.length, 6);
  assert.deepEqual(
    gates.map((gate) => `${gate.code}:${gate.status}`),
    [
      "researchSufficiency:blocked",
      "evidencePackage:passed",
      "hookCoverage:warning",
      "fourPointAudit:passed",
      "languageGuard:passed",
      "archetypeRhythmConsistency:warning",
    ],
  );
  assert.equal(gates[0]?.actionLabel, "去补研究信源");
  assert.match(gates[4]?.detail || "", /未命中语言守卫规则/);
});
