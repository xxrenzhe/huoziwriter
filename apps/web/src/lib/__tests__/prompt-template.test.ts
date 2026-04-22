import assert from "node:assert/strict";
import test from "node:test";

import { formatPromptTemplate } from "../prompt-template";

test("formatPromptTemplate replaces double-brace placeholders and preserves literal json braces", () => {
  const rendered = formatPromptTemplate(
    [
      "标题：{{title}}",
      '输出 JSON：{"field":"value"}',
      "说明：{{summary}}",
    ].join("\n"),
    {
      title: "AI 代理改写内容协作",
      summary: "先保留 JSON 字面量，再替换变量。",
    },
  );

  assert.match(rendered, /标题：AI 代理改写内容协作/);
  assert.match(rendered, /输出 JSON：\{"field":"value"\}/);
  assert.match(rendered, /说明：先保留 JSON 字面量，再替换变量。/);
});

test("formatPromptTemplate throws on missing variables", () => {
  assert.throws(
    () => formatPromptTemplate("标题：{{title}}\n摘要：{{summary}}", { title: "只给了标题" }),
    /缺少变量：summary/,
  );
});

test("formatPromptTemplate serializes object values for prompt injection", () => {
  const rendered = formatPromptTemplate("草稿：{{draft}}", {
    draft: {
      coreAssertion: "库存先于灵感",
      whyNow: "团队开始追求稳定周更",
    },
  });

  assert.match(rendered, /"coreAssertion":"库存先于灵感"/);
  assert.match(rendered, /"whyNow":"团队开始追求稳定周更"/);
});
