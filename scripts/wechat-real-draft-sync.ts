#!/usr/bin/env tsx

import fs from "node:fs";
import path from "node:path";

import { resumeArticleAutomationRun } from "../apps/web/src/lib/article-automation-orchestrator";
import { createArticleAutomationRun, getArticleAutomationRunById } from "../apps/web/src/lib/article-automation-runs";
import { findUserByUsername } from "../apps/web/src/lib/auth";
import { ensureBootstrapData } from "../apps/web/src/lib/repositories";
import { createPersona, getDefaultPersona } from "../apps/web/src/lib/personas";
import { createSeries, getDefaultSeries, getSeries } from "../apps/web/src/lib/series";
import { ensureWechatEnvConnectionForUser } from "../apps/web/src/lib/wechat-env-connection";
import { runPendingMigrations } from "./db-flow";

function loadDotenv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

function readOption(name: string) {
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1]) {
      return String(process.argv[index + 1]);
    }
  }
  return "";
}

async function ensureSeries(userId: number) {
  const defaultSeries = await getDefaultSeries(userId);
  if (defaultSeries) {
    return defaultSeries;
  }
  const personas = await getSeries(userId);
  if (personas[0]) {
    return personas[0];
  }
  const defaultPersona = await getDefaultPersona(userId);
  const persona = defaultPersona ?? await createPersona({
    userId,
    name: "微信终稿同步默认人设",
    identityTags: ["公众号作者"],
    writingStyleTags: ["案例拆解"],
    summary: "用于真实微信草稿箱同步验收的人设",
    domainKeywords: ["AI", "内容运营"],
    argumentPreferences: ["先结论后展开"],
    toneConstraints: ["克制"],
    audienceHints: ["公众号读者"],
    sourceMode: "manual",
    isDefault: true,
  });
  return await createSeries({
    userId,
    name: "微信终稿同步默认系列",
    personaId: persona.id,
    thesis: "验证自动化终稿可以真实同步到微信草稿箱。",
    targetAudience: "需要长期运营公众号的内容团队",
  });
}

async function main() {
  loadDotenv();
  await runPendingMigrations();
  await ensureBootstrapData();

  const username = readOption("--user") || "huozi";
  const inputText = readOption("--input") || "请生成一篇关于 AI 自动写作生产线如何把研究、核查、排版和发布串成闭环的公众号文章，并同步到草稿箱。";

  const user = await findUserByUsername(username);
  if (!user) {
    throw new Error(`未找到用户 ${username}，请先运行 pnpm db:init 或指定 --user`);
  }

  const series = await ensureSeries(user.id);
  const connection = await ensureWechatEnvConnectionForUser(user.id, { throwOnError: true });
  if (!connection?.id) {
    throw new Error("未能从环境变量创建可用的公众号连接");
  }

  const created = await createArticleAutomationRun({
    userId: user.id,
    inputMode: "brief",
    inputText,
    targetSeriesId: series.id,
    targetWechatConnectionId: connection.id,
    automationLevel: "wechatDraft",
  });
  const resumed = await resumeArticleAutomationRun({
    runId: created.run.id,
    userId: user.id,
  });
  const detail = await getArticleAutomationRunById(created.run.id, user.id);
  const publishGuardStage = detail?.stages.find((stage) => stage.stageCode === "publishGuard") ?? null;

  const result = {
    ok: Boolean(resumed.run.finalWechatMediaId),
    runId: resumed.run.id,
    articleId: resumed.run.articleId,
    status: resumed.run.status,
    blockedReason: resumed.run.blockedReason,
    finalWechatMediaId: resumed.run.finalWechatMediaId,
    articleTitle: detail?.article?.title ?? null,
    wechatConnectionId: connection.id,
    publishGuardStatus: publishGuardStage?.status ?? null,
    publishGuardOutput: publishGuardStage?.outputJson ?? null,
  };

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null,
  }, null, 2));
  process.exit(1);
});
