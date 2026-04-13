import { getDatabase } from "./db";

const DAILY_GENERATION_KEY = "daily_generation";

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
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export async function getDailyGenerationUsage(userId: number) {
  await ensureUsageCounterSchema();
  const db = getDatabase();
  const row = await db.queryOne<{ value: number }>(
    "SELECT value FROM usage_counters WHERE user_id = ? AND counter_key = ? AND counter_date = ?",
    [userId, DAILY_GENERATION_KEY, todayKey()],
  );
  return row?.value ?? 0;
}

export async function incrementDailyGenerationUsage(userId: number) {
  await ensureUsageCounterSchema();
  const db = getDatabase();
  const now = new Date().toISOString();
  const dateKey = todayKey();
  const existing = await db.queryOne<{ id: number; value: number }>(
    "SELECT id, value FROM usage_counters WHERE user_id = ? AND counter_key = ? AND counter_date = ?",
    [userId, DAILY_GENERATION_KEY, dateKey],
  );

  if (existing) {
    await db.exec("UPDATE usage_counters SET value = ?, updated_at = ? WHERE id = ?", [existing.value + 1, now, existing.id]);
    return existing.value + 1;
  }

  await db.exec(
    `INSERT INTO usage_counters (user_id, counter_key, counter_date, value, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, DAILY_GENERATION_KEY, dateKey, 1, now, now],
  );
  return 1;
}
