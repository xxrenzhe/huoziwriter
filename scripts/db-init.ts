#!/usr/bin/env tsx
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeDatabase, getDatabase } from "../apps/web/src/lib/db";
import { createUser, findUserByUsername } from "../apps/web/src/lib/auth";
import { ensureBootstrapData } from "../apps/web/src/lib/repositories";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

function splitSqlStatements(sql: string) {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*(?:\n|$)/)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0 && statement !== "BEGIN" && statement !== "BEGIN TRANSACTION" && statement !== "COMMIT");
}

async function runSqlFile(filePath: string) {
  const sql = fs.readFileSync(filePath, "utf8");
  const db = getDatabase();
  const statements = splitSqlStatements(sql);

  for (const statement of statements) {
    await db.exec(statement);
  }
}

async function ensureAdmin() {
  const existing = await findUserByUsername("huozi");
  if (existing) {
    console.log("默认管理员已存在: huozi");
    return;
  }
  await createUser({
    username: "huozi",
    email: "admin@huoziwriter.local",
    password: process.env.DEFAULT_ADMIN_PASSWORD || "REDACTED_ADMIN_PASSWORD",
    displayName: "Huozi Admin",
    role: "admin",
    planCode: "team",
    mustChangePassword: false,
  });
  console.log("已创建默认管理员 huozi");
}

async function main() {
  const migrationPath = process.env.DATABASE_URL
    ? path.resolve(repoRoot, "pg_migrations/000_init_schema.postgresql.sql")
    : path.resolve(repoRoot, "migrations/000_init_schema.sqlite.sql");
  await runSqlFile(migrationPath);
  await ensureBootstrapData();
  await ensureAdmin();
  await closeDatabase();
}

main().catch(async (error) => {
  console.error(error);
  await closeDatabase();
  process.exit(1);
});
