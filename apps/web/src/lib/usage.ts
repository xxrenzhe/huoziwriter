import { getDatabase } from "./db";

const DAILY_GENERATION_KEY = "daily_generation";
const DAILY_COVER_IMAGE_KEY = "daily_cover_image";
const DAILY_STYLE_EXTRACT_KEY = "daily_style_extract";

export async function ensureUsageCounterSchema() {
  const db = getDatabase();
  await db.exec(
    `CREATE TABLE IF NOT EXISTS usage_counters (
      id ${db.type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${db.type === "postgres" ? "" : "AUTOINCREMENT"},
      user_id ${db.type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      counter_key TEXT NOT NULL,
      counter_date ${db.type === "postgres" ? "DATE" : "TEXT"} NOT NULL,
      value INTEGER NOT NULL DEFAULT 0,
      created_at ${db.type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${db.type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${db.type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${db.type === "postgres" ? "NOW()" : "(datetime('now'))"},
      UNIQUE(user_id, counter_key, counter_date)
    )`,
  );
  await db.exec(
    `CREATE TABLE IF NOT EXISTS visitor_usage_counters (
      id ${db.type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${db.type === "postgres" ? "" : "AUTOINCREMENT"},
      visitor_key TEXT NOT NULL,
      counter_key TEXT NOT NULL,
      counter_date ${db.type === "postgres" ? "DATE" : "TEXT"} NOT NULL,
      value INTEGER NOT NULL DEFAULT 0,
      created_at ${db.type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${db.type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${db.type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${db.type === "postgres" ? "NOW()" : "(datetime('now'))"},
      UNIQUE(visitor_key, counter_key, counter_date)
    )`,
  );
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function getDailyUsage(userId: number, counterKey: string) {
  await ensureUsageCounterSchema();
  const db = getDatabase();
  const row = await db.queryOne<{ value: number }>(
    "SELECT value FROM usage_counters WHERE user_id = ? AND counter_key = ? AND counter_date = ?",
    [userId, counterKey, todayKey()],
  );
  return row?.value ?? 0;
}

async function incrementDailyUsage(userId: number, counterKey: string) {
  await ensureUsageCounterSchema();
  const db = getDatabase();
  const now = new Date().toISOString();
  const dateKey = todayKey();
  const existing = await db.queryOne<{ id: number; value: number }>(
    "SELECT id, value FROM usage_counters WHERE user_id = ? AND counter_key = ? AND counter_date = ?",
    [userId, counterKey, dateKey],
  );

  if (existing) {
    await db.exec("UPDATE usage_counters SET value = ?, updated_at = ? WHERE id = ?", [existing.value + 1, now, existing.id]);
    return existing.value + 1;
  }

  await db.exec(
    `INSERT INTO usage_counters (user_id, counter_key, counter_date, value, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, counterKey, dateKey, 1, now, now],
  );
  return 1;
}

async function getVisitorDailyUsage(visitorKey: string, counterKey: string) {
  await ensureUsageCounterSchema();
  const db = getDatabase();
  const row = await db.queryOne<{ value: number }>(
    "SELECT value FROM visitor_usage_counters WHERE visitor_key = ? AND counter_key = ? AND counter_date = ?",
    [visitorKey, counterKey, todayKey()],
  );
  return row?.value ?? 0;
}

async function incrementVisitorDailyUsage(visitorKey: string, counterKey: string) {
  await ensureUsageCounterSchema();
  const db = getDatabase();
  const now = new Date().toISOString();
  const dateKey = todayKey();
  const existing = await db.queryOne<{ id: number; value: number }>(
    "SELECT id, value FROM visitor_usage_counters WHERE visitor_key = ? AND counter_key = ? AND counter_date = ?",
    [visitorKey, counterKey, dateKey],
  );

  if (existing) {
    await db.exec("UPDATE visitor_usage_counters SET value = ?, updated_at = ? WHERE id = ?", [existing.value + 1, now, existing.id]);
    return existing.value + 1;
  }

  await db.exec(
    `INSERT INTO visitor_usage_counters (visitor_key, counter_key, counter_date, value, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [visitorKey, counterKey, dateKey, 1, now, now],
  );
  return 1;
}

export async function getDailyGenerationUsage(userId: number) {
  return getDailyUsage(userId, DAILY_GENERATION_KEY);
}

export async function incrementDailyGenerationUsage(userId: number) {
  return incrementDailyUsage(userId, DAILY_GENERATION_KEY);
}

export async function getDailyCoverImageUsage(userId: number) {
  return getDailyUsage(userId, DAILY_COVER_IMAGE_KEY);
}

export async function incrementDailyCoverImageUsage(userId: number) {
  return incrementDailyUsage(userId, DAILY_COVER_IMAGE_KEY);
}

export async function getDailyStyleExtractUsage(userId: number) {
  return getDailyUsage(userId, DAILY_STYLE_EXTRACT_KEY);
}

export async function incrementDailyStyleExtractUsage(userId: number) {
  return incrementDailyUsage(userId, DAILY_STYLE_EXTRACT_KEY);
}

export async function getVisitorDailyStyleExtractUsage(visitorKey: string) {
  return getVisitorDailyUsage(visitorKey, DAILY_STYLE_EXTRACT_KEY);
}

export async function incrementVisitorDailyStyleExtractUsage(visitorKey: string) {
  return incrementVisitorDailyUsage(visitorKey, DAILY_STYLE_EXTRACT_KEY);
}
