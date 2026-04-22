import assert from "node:assert/strict";
import test from "node:test";

import { buildGatewaySystemSegments } from "../ai-gateway-system-segments";

test("buildGatewaySystemSegments filters empty blocks and preserves cacheable flags", () => {
  assert.deepEqual(
    buildGatewaySystemSegments([
      { text: "  核心 system prompt  ", cacheable: true },
      { text: "" },
      { text: "  " },
      { text: "动态补充约束", cacheable: false },
      { text: null, cacheable: true },
    ]),
    [
      { text: "核心 system prompt", cacheable: true },
      { text: "动态补充约束", cacheable: false },
    ],
  );
});
