#!/usr/bin/env tsx
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { createUser, findUserByUsername, syncUserSubscription } from "../apps/web/src/lib/auth";
import { closeDatabase, getDatabase } from "../apps/web/src/lib/db";
import { ensureBootstrapData } from "../apps/web/src/lib/repositories";
import { hashPassword, verifyPassword } from "../apps/web/src/lib/security";
import { runPendingMigrations } from "./db-flow";

const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

async function ensureAdminUser() {
  const password = String(process.env.DEFAULT_ADMIN_PASSWORD || "").trim();
  if (!password) {
    throw new Error("db:init 需要先配置 DEFAULT_ADMIN_PASSWORD 才能初始化默认后台账号");
  }

  const existing = await findUserByUsername("huozi");
  if (existing) {
    const passwordMatches = existing.password_hash ? await verifyPassword(password, existing.password_hash) : false;
    const needsSync = !passwordMatches || existing.role !== "admin" || !existing.is_active || Boolean(existing.must_change_password) || existing.plan_code !== "ultra";
    if (!needsSync) {
      console.log("默认后台账号已存在: huozi");
      return;
    }

    const now = new Date().toISOString();
    await getDatabase().exec(
      `UPDATE users
       SET password_hash = ?, role = ?, plan_code = ?, must_change_password = ?, is_active = ?, updated_at = ?
       WHERE id = ?`,
      [await hashPassword(password), "admin", "ultra", false, true, now, existing.id],
    );
    await syncUserSubscription(existing.id, "ultra", true);
    console.log("已同步默认后台账号 huozi");
    return;
  }
  await createUser({
    username: "huozi",
    email: "admin@huoziwriter.local",
    password,
    displayName: "Huozi Admin",
    role: "admin",
    planCode: "ultra",
    mustChangePassword: false,
  });
  console.log("已创建默认后台账号 huozi");
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
  await ensureAdminUser();
  await closeDatabase();
}

main().catch(async (error) => {
  console.error(error);
  await closeDatabase();
  process.exit(1);
});
