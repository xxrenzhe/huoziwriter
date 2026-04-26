import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { closeDatabase, getDatabase } from "../db";
import { runAdminTopicSync } from "../topic-signals";
import { runPendingMigrations } from "../../../../../scripts/db-flow";

async function withTempDatabase<T>(name: string, run: () => Promise<T>) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `huoziwriter-topic-signals-${name}-`));
  const tempDbPath = path.join(tempDir, "fresh.db");
  const previousDatabasePath = process.env.DATABASE_PATH;

  process.env.DATABASE_PATH = tempDbPath;
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

test("runAdminTopicSync ingests structured topics from Hacker News and Remotive sources", async () => {
  await withTempDatabase("structured-sources", async () => {
    const db = getDatabase();
    const now = "2026-04-26T08:00:00.000Z";
    await db.exec("DELETE FROM topic_sources");
    await db.exec(
      `INSERT INTO topic_sources (owner_user_id, name, homepage_url, source_type, priority, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        null,
        "Hacker News Top Stories",
        "https://hacker-news.firebaseio.com/v0/topstories.json",
        "news",
        95,
        true,
        now,
        now,
        null,
        "Remotive Remote Jobs",
        "https://remotive.com/api/remote-jobs",
        "news",
        91,
        true,
        now,
        now,
      ],
    );

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/v0/topstories.json")) {
        return new Response(JSON.stringify([11]), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.endsWith("/v0/item/11.json")) {
        return new Response(JSON.stringify({
          id: 11,
          title: "HN says AI agents are changing support teams",
          url: "https://news.ycombinator.com/item?id=11",
          time: 1_714_118_400,
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url === "https://remotive.com/api/remote-jobs") {
        return new Response(JSON.stringify({
          jobs: [
            {
              title: "Growth Marketer",
              company_name: "RemoteCo",
              url: "https://remotive.com/remote-jobs/marketing/growth-marketer-22",
              category: "Marketing",
              publication_date: "2026-04-25T08:00:00Z",
              candidate_required_location: "Global",
              job_type: "Contract",
            },
          ],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    try {
      const result = await runAdminTopicSync({ limitPerSource: 2 });
      assert.equal(result.failedSourceCount, 0);
      assert.equal(result.completedSourceCount, 2);

      const items = await db.query<{
        source_name: string;
        title: string;
        summary: string;
        source_url: string | null;
        topic_verticals_json: string;
      }>(
        "SELECT source_name, title, summary, source_url, topic_verticals_json FROM topic_items ORDER BY id ASC",
      );
      assert.equal(items.length, 2);
      assert.equal(items[0]?.source_name, "Hacker News Top Stories");
      assert.match(items[0]?.title || "", /HN says AI agents/);
      assert.deepEqual(JSON.parse(items[0]?.topic_verticals_json || "[]"), ["ai_products"]);
      assert.equal(items[1]?.source_name, "Remotive Remote Jobs");
      assert.match(items[1]?.summary || "", /Global/);
      assert.deepEqual(JSON.parse(items[1]?.topic_verticals_json || "[]"), ["career", "overseas_income", "side_hustles"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
