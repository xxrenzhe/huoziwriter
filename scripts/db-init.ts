#!/usr/bin/env tsx
import { closeDatabase } from "../apps/web/src/lib/db";
import { createUser, findUserByUsername } from "../apps/web/src/lib/auth";
import { ensureBootstrapData } from "../apps/web/src/lib/repositories";
import { runPendingMigrations } from "./db-flow";

async function ensureOpsUser() {
  const existing = await findUserByUsername("huozi");
  if (existing) {
    console.log("默认运维账号已存在: huozi");
    return;
  }
  await createUser({
    username: "huozi",
    email: "ops@huoziwriter.local",
    password: process.env.DEFAULT_OPS_PASSWORD || "REDACTED_ADMIN_PASSWORD",
    displayName: "Huozi Ops",
    role: "ops",
    planCode: "ultra",
    mustChangePassword: false,
  });
  console.log("已创建默认运维账号 huozi");
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
  await ensureOpsUser();
  await closeDatabase();
}

main().catch(async (error) => {
  console.error(error);
  await closeDatabase();
  process.exit(1);
});
