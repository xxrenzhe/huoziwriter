import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { closeDatabase, getDatabase } from "../db";
import { getActiveTemplateById } from "../layout-templates";
import { auditImportedHtmlTemplate, getLatestTemplateImportAudit, importHtmlTemplate } from "../template-import";
import { runPendingMigrations } from "../../../../../scripts/db-flow";

async function withTempDatabase<T>(name: string, run: () => Promise<T>) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `huoziwriter-template-import-${name}-`));
  const tempDbPath = path.join(tempDir, "fresh.db");
  const previousDatabasePath = process.env.DATABASE_PATH;

  process.env.DATABASE_PATH = tempDbPath;
  delete process.env.DATABASE_URL;
  await closeDatabase();

  try {
    await runPendingMigrations();
    return await run();
  } finally {
    await closeDatabase();
    if (previousDatabasePath == null) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousDatabasePath;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test("auditImportedHtmlTemplate blocks scripts and external stylesheets", () => {
  const audit = auditImportedHtmlTemplate(`
    <html>
      <head><link rel="stylesheet" href="https://cdn.example.com/a.css"></head>
      <body><script>alert(1)</script><p>这是一段足够长的正文内容，用于模拟微信公众号模板。</p></body>
    </html>
  `);

  assert.equal(audit.status, "blocked");
  assert.ok(audit.issues.some((issue) => issue.code === "external_script_blocked"));
  assert.ok(audit.issues.some((issue) => issue.code === "external_stylesheet_blocked"));
});

test("auditImportedHtmlTemplate flags mobile reading experience risks", () => {
  const audit = auditImportedHtmlTemplate(`
    <article style="color: #777; background: #888;">
      <section style="color: #333; background-color: #444;">
        <p>${"这是一段首屏里连续堆叠的正文内容，缺少图片、小标题和引用停顿点。".repeat(28)}</p>
        <p>${"这是一段很长的移动端段落，会让读者在手机上读起来很费力。".repeat(24)}</p>
      </section>
    </article>
  `);

  assert.equal(audit.status, "warning");
  assert.ok(audit.issues.some((issue) => issue.code === "low_contrast_risk"));
  assert.ok(audit.issues.some((issue) => issue.code === "first_screen_dense_risk"));
  assert.ok(audit.issues.some((issue) => issue.code === "paragraph_density_risk"));
  assert.ok(audit.issues.some((issue) => issue.code === "image_density_low_risk"));
});

test("importHtmlTemplate persists private template and audit record", async () => {
  await withTempDatabase("valid", async () => {
    const now = new Date().toISOString();
    await getDatabase().exec(
      "INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [1, "template-import@example.com", "test-hash", "admin", now, now],
    );

    const imported = await importHtmlTemplate({
      userId: 1,
      name: "实战复盘模板",
      html: `
        <article style="max-width: 640px; margin: 0 auto;">
          <h1>实战复盘模板</h1>
          <p>第一段提供具体场景和判断。</p>
          <p>第二段提供案例、数据和边界。</p>
          <blockquote>这里是引用样式。</blockquote>
        </article>
      `,
    });

    assert.equal(imported.imported, true);
    assert.equal(imported.audit.status, "passed");
    const template = await getActiveTemplateById(imported.templateId, 1);
    assert.equal(template?.ownerUserId, 1);
    assert.equal(template?.name, "实战复盘模板");
    const audit = await getLatestTemplateImportAudit({ userId: 1, templateId: imported.templateId });
    assert.equal(audit?.status, "passed");
    assert.equal(audit?.summary.imported, true);
  });
});

test("importHtmlTemplate records blocked audit without creating active template", async () => {
  await withTempDatabase("blocked", async () => {
    const now = new Date().toISOString();
    await getDatabase().exec(
      "INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [2, "blocked-template@example.com", "test-hash", "admin", now, now],
    );

    const imported = await importHtmlTemplate({
      userId: 2,
      name: "危险模板",
      html: `<article><script>alert(1)</script><p>这段正文足够长，但模板含有脚本，不能进入发布链路。</p></article>`,
    });

    assert.equal(imported.imported, false);
    assert.equal(imported.audit.status, "blocked");
    const template = await getActiveTemplateById(imported.templateId, 2);
    assert.equal(template, null);
    const audit = await getLatestTemplateImportAudit({ userId: 2, templateId: imported.templateId });
    assert.equal(audit?.status, "blocked");
    assert.equal(audit?.summary.imported, false);
  });
});
