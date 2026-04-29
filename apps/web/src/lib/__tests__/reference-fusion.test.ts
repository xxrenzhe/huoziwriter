import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReferenceFusionProfile,
  buildReferenceFusionPromptLines,
  evaluateReferenceFusionGuard,
  normalizeReferenceFusionMode,
  normalizeReferenceFusionPayload,
} from "../reference-fusion";

test("reference fusion modes produce distinct research focus", () => {
  const inspiration = buildReferenceFusionProfile({
    mode: "inspiration",
    sourceUrls: ["https://example.com/a"],
  });
  const evidence = buildReferenceFusionProfile({
    mode: "evidence",
    sourceUrls: ["https://example.com/a"],
  });
  const structure = buildReferenceFusionProfile({
    mode: "structure",
    sourceUrls: ["https://example.com/a"],
  });

  assert.equal(normalizeReferenceFusionMode("close_read"), "close_read");
  assert.equal(normalizeReferenceFusionMode("unknown"), "evidence");
  assert.notDeepEqual(inspiration.extractionFocus, evidence.extractionFocus);
  assert.notDeepEqual(evidence.extractionFocus, structure.extractionFocus);
  assert.match(buildReferenceFusionPromptLines(structure, "outlinePlanning").join("\n"), /可借结构/);
});

test("close read always carries avoidance list and differentiation strategy", () => {
  const profile = normalizeReferenceFusionPayload({
    mode: "close_read",
    sourceUrls: ["https://example.com/source"],
  });

  assert.equal(profile.mode, "close_read");
  assert.equal(profile.riskLevel, "high");
  assert(profile.avoidanceList.length >= 4);
  assert.match(profile.differentiationStrategy, /作者视角|差异化|重组/);
  assert.match(buildReferenceFusionPromptLines(profile, "deepWriting").join("\n"), /正文规避清单/);
});

test("publish guard helper blocks high-risk reference mode without boundary fields", () => {
  const blocked = evaluateReferenceFusionGuard({
    researchBriefPayload: {
      referenceFusion: {
        mode: "close_read",
        avoidanceList: [],
        differentiationStrategy: "",
      },
    },
  });
  const passed = evaluateReferenceFusionGuard({
    researchBriefPayload: {
      referenceFusion: buildReferenceFusionProfile({
        mode: "close_read",
        sourceUrls: ["https://example.com/source"],
      }),
    },
  });

  assert.equal(blocked.status, "blocked");
  assert(blocked.issues.some((item) => /规避清单|差异化/.test(item)));
  assert.equal(passed.status, "passed");
});
