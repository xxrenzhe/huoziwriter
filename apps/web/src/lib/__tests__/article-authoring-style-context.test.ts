import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { closeDatabase, getDatabase } from "../db";
import { getArticleAuthoringStyleContext } from "../article-authoring-style-context";
import { upsertArticleOutcome, upsertArticleOutcomeSnapshot } from "../repositories";
import { ensureExtendedProductSchema } from "../schema-bootstrap";
import { ensureAutoWritingStyleProfile, getWritingStyleProfiles } from "../writing-style-profiles";
import { runPendingMigrations } from "../../../../../scripts/db-flow";

async function withTempDatabase<T>(name: string, run: () => Promise<T>) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `huoziwriter-authoring-style-${name}-`));
  const tempDbPath = path.join(tempDir, "fresh.db");
  const previousDatabasePath = process.env.DATABASE_PATH;

  process.env.DATABASE_PATH = tempDbPath;
  await closeDatabase();

  try {
    await runPendingMigrations();
    return await run();
  } finally {
    await closeDatabase();
    if (previousDatabasePath == null) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDatabasePath;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function seedUser(userId: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.exec(
    `INSERT INTO users (
      id, username, email, password_hash, display_name, role, plan_code, must_change_password, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      `authoring_style_user_${userId}`,
      null,
      null,
      null,
      "user",
      "ultra",
      0,
      1,
      now,
      now,
    ],
  );
}

async function seedDefaultPersona(userId: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.exec(
    `INSERT INTO personas (
      user_id, name, identity_tags_json, writing_style_tags_json, summary,
      domain_keywords_json, argument_preferences_json, tone_constraints_json,
      audience_hints_json, source_mode, is_default, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      "自动沉淀作者",
      JSON.stringify(["深度写作"]),
      JSON.stringify(["清晰", "克制"]),
      "默认作者人设",
      JSON.stringify(["AI", "副业"]),
      JSON.stringify(["先判断后论证"]),
      JSON.stringify(["避免空话"]),
      JSON.stringify(["公众号读者"]),
      "manual",
      true,
      now,
      now,
    ],
  );
}

function buildLongMarkdown(seed: string) {
  return Array.from({ length: 12 }, (_, index) =>
    `${seed} 第 ${index + 1} 段：先给判断，再给例子，再把行动建议落回真实场景。很多人会先盯着工具，但真正拉开差距的是判断顺序、表达节奏和证据密度。`,
  ).join("\n\n");
}

async function seedArticle(input: {
  userId: number;
  title: string;
  markdownContent: string;
  status?: string;
  createdAt: string;
  updatedAt?: string;
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const updatedAt = input.updatedAt ?? input.createdAt;
  await db.exec(
    `INSERT INTO articles (user_id, title, markdown_content, html_content, status, series_id, wechat_template_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.userId,
      input.title,
      input.markdownContent,
      null,
      input.status ?? "published",
      null,
      null,
      input.createdAt,
      updatedAt,
    ],
  );
}

test("ensureAutoWritingStyleProfile creates a multi-sample profile from recent long-form articles", async () => {
  await withTempDatabase("auto-create", async () => {
    const userId = 21;
    await seedUser(userId);
    await seedArticle({
      userId,
      title: "第一篇",
      markdownContent: buildLongMarkdown("第一篇"),
      createdAt: "2026-04-20T00:00:00.000Z",
    });
    await seedArticle({
      userId,
      title: "第二篇",
      markdownContent: buildLongMarkdown("第二篇"),
      createdAt: "2026-04-21T00:00:00.000Z",
    });
    await seedArticle({
      userId,
      title: "第三篇",
      markdownContent: buildLongMarkdown("第三篇"),
      createdAt: "2026-04-22T00:00:00.000Z",
    });

    const profile = await ensureAutoWritingStyleProfile(userId);
    const profiles = await getWritingStyleProfiles(userId);

    assert.ok(profile);
    assert.equal(profiles.length, 1);
    assert.equal(profile?.sampleCount, 3);
    assert.match(profile?.name ?? "", /自动沉淀文风/);
  });
});

test("getArticleAuthoringStyleContext auto-selects best available style profile when persona is unbound", async () => {
  await withTempDatabase("auto-select", async () => {
    const userId = 22;
    await seedUser(userId);
    await seedDefaultPersona(userId);
    await seedArticle({
      userId,
      title: "A",
      markdownContent: buildLongMarkdown("A"),
      createdAt: "2026-04-20T00:00:00.000Z",
    });
    await seedArticle({
      userId,
      title: "B",
      markdownContent: buildLongMarkdown("B"),
      createdAt: "2026-04-21T00:00:00.000Z",
    });
    await seedArticle({
      userId,
      title: "C",
      markdownContent: buildLongMarkdown("C"),
      createdAt: "2026-04-22T00:00:00.000Z",
    });

    const context = await getArticleAuthoringStyleContext(userId);

    assert.ok(context.writingStyleProfile);
    assert.equal(context.writingStyleProfile?.sampleCount, 3);
    assert.ok(context.writingStyleProfile?.confidenceProfile);
    assert.equal(context.writingStyleProfile?.bindingSource, "auto.bestAvailableWritingStyleProfile");
    assert.equal(context.persona?.boundWritingStyleProfileName, context.writingStyleProfile?.name);
  });
});

test("getArticleAuthoringStyleContext writes author outcome preferences back into runtime persona and style hints", async () => {
  await withTempDatabase("outcome-feedback-runtime-writeback", async () => {
    const userId = 23;
    await seedUser(userId);
    await seedDefaultPersona(userId);
    await seedArticle({
      userId,
      title: "当前稿件",
      markdownContent: buildLongMarkdown("当前稿件"),
      status: "draft",
      createdAt: "2026-04-28T00:00:00.000Z",
    });
    await seedArticle({
      userId,
      title: "历史样本",
      markdownContent: buildLongMarkdown("历史样本"),
      createdAt: "2026-04-26T00:00:00.000Z",
    });

    const db = getDatabase();
    const now = new Date().toISOString();
    await db.exec(
      `INSERT INTO writing_style_profiles (
        id, user_id, name, source_url, source_title, summary, tone_keywords_json, structure_patterns_json,
        language_habits_json, opening_patterns_json, ending_patterns_json, do_not_write_json, imitation_prompt,
        source_excerpt, analysis_payload_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        501,
        userId,
        "绑定文风",
        null,
        null,
        "测试用绑定文风",
        JSON.stringify(["克制"]),
        JSON.stringify(["先判断后展开"]),
        JSON.stringify(["短句"]),
        JSON.stringify(["背景铺垫", "问题起手"]),
        JSON.stringify(["回到判断"]),
        JSON.stringify(["避免空话"]),
        "保持克制判断。",
        null,
        JSON.stringify({
          statePresets: ["克制分析态"],
          sampleCount: 2,
        }),
        now,
        now,
      ],
    );
    await db.exec(
      "UPDATE personas SET bound_writing_style_profile_id = ?, updated_at = ? WHERE user_id = ? AND is_default = 1",
      [501, now, userId],
    );

    await db.exec(
      `INSERT INTO article_stage_artifacts (
        article_id, stage_code, status, summary, payload_json, model, provider, error_message, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        2,
        "deepWriting",
        "ready",
        "deepWriting",
        JSON.stringify({
          articlePrototype: "opinion",
          articlePrototypeLabel: "观点判断",
          stateVariantCode: "animated",
          stateVariantLabel: "兴奋分享态",
          openingPatternLabel: "冲突起手",
          sectionRhythm: "短段推进",
        }),
        null,
        null,
        null,
        now,
        now,
      ],
    );
    await upsertArticleOutcome({
      articleId: 2,
      userId,
      hitStatus: "hit",
      scorecard: {},
      attribution: null,
    });
    await upsertArticleOutcomeSnapshot({
      articleId: 2,
      userId,
      windowCode: "7d",
      readCount: 800,
      shareCount: 4,
      likeCount: 16,
      writingStateFeedback: {
        adoptedPrototypeCode: "opinion",
        followedPrototypeRecommendation: true,
        adoptedVariantCode: "animated",
        followedRecommendation: true,
        adoptedOpeningPatternLabel: "冲突起手",
        recommendedOpeningPatternLabel: "冲突起手",
      },
    });

    const context = await getArticleAuthoringStyleContext(userId, 1);

    assert.equal(context.persona?.argumentPreferences?.[0], "近期高命中原型：观点判断");
    assert.equal(context.persona?.argumentPreferences?.[1], "近期高命中状态：兴奋分享态");
    assert.equal(context.writingStyleProfile?.openingPatterns[0], "冲突起手");
    assert.equal(context.writingStyleProfile?.statePresets?.[0], "优先使用兴奋分享态");
  });
});
