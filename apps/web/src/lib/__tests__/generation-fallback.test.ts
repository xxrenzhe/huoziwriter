import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { closeDatabase } from "../db";
import { buildGeneratedArticleDraft } from "../generation";
import { runPendingMigrations } from "../../../../../scripts/db-flow";

async function withTempDatabase<T>(name: string, run: () => Promise<T>) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `huoziwriter-generation-${name}-`));
  const tempDbPath = path.join(tempDir, "fresh.db");
  const previousDatabasePath = process.env.DATABASE_PATH;
  const previousOpenAiApiKey = process.env.OPENAI_API_KEY;
  const previousAnthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const previousGeminiApiKey = process.env.GEMINI_API_KEY;

  process.env.DATABASE_PATH = tempDbPath;
  process.env.OPENAI_API_KEY = "";
  process.env.ANTHROPIC_API_KEY = "";
  process.env.GEMINI_API_KEY = "";
  await closeDatabase();

  try {
    await runPendingMigrations();
    return await run();
  } finally {
    await closeDatabase();
    if (previousDatabasePath == null) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousDatabasePath;
    if (previousOpenAiApiKey == null) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAiApiKey;
    if (previousAnthropicApiKey == null) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousAnthropicApiKey;
    if (previousGeminiApiKey == null) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousGeminiApiKey;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test("buildGeneratedArticleDraft fallback never exposes internal prompts", async () => {
  await withTempDatabase("fallback-clean-copy", async () => {
    const result = await buildGeneratedArticleDraft({
      title: "AI 时代，普通人如何把焦虑变成可执行的下一步",
      fragments: ["这是第二条用于验证 worker 自动编译的测试碎片", "把焦虑拆成具体工作环节", "先做一个今天能验证的小实验"],
      bannedWords: [],
      outlineNodes: [
        { title: "痛点引入", description: "焦虑来自旧判断失效" },
        { title: "行动建议", description: "把变化压成小实验" },
      ],
    });

    assert.match(result.markdown, /^# AI 时代，普通人如何把焦虑变成可执行的下一步/);
    assert.match(result.markdown, /## 痛点引入/);
    assert.match(result.markdown, /今天能不能验证一个小假设/);
    assert.doesNotMatch(result.markdown, /测试碎片|worker 自动编译/);
    assert.doesNotMatch(result.markdown, /你是中文专栏作者/);
    assert.doesNotMatch(result.markdown, /请基于以下事实素材/);
    assert.doesNotMatch(result.markdown, /当前默认作者人设|当前稿件大纲锚点/);
    assert.doesNotMatch(result.markdown, /system|prompt|cacheable/i);
  });
});
