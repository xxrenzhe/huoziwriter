#!/usr/bin/env tsx
import { closeDatabase } from "../apps/web/src/lib/db";
import { createUser, findUserByUsername } from "../apps/web/src/lib/auth";
import { ensureBootstrapData } from "../apps/web/src/lib/repositories";
import { runPendingMigrations } from "./db-flow";

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
  const migrationResult = await runPendingMigrations();
  if (migrationResult.adoptedExisting.length > 0) {
    console.log(`db:init: adopted existing baseline schema for ${migrationResult.adoptedExisting.join(", ")}`);
  }
  if (migrationResult.executed.length > 0) {
    console.log(`db:init: applied migrations ${migrationResult.executed.join(", ")}`);
  } else {
    console.log(`db:init: ${migrationResult.type} schema already up to date`);
  }

  await ensureBootstrapData();
  await ensureAdmin();
  await closeDatabase();
}

main().catch(async (error) => {
  console.error(error);
  await closeDatabase();
  process.exit(1);
});
