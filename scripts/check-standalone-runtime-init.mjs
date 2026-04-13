import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneRoot = path.join(repoRoot, "apps/web/.next/standalone");
const pnpmStoreRoot = path.join(repoRoot, "node_modules/.pnpm");

function ensureExists(targetPath, message) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(message);
  }
}

function copyPackage(tempRoot, packageName) {
  const versionDir = fs
    .readdirSync(pnpmStoreRoot)
    .find((entry) => entry.startsWith(`${packageName}@`) && fs.existsSync(path.join(pnpmStoreRoot, entry, "node_modules", packageName)));

  if (!versionDir) {
    throw new Error(`missing package in pnpm store: ${packageName}`);
  }

  const source = path.join(pnpmStoreRoot, versionDir, "node_modules", packageName);
  const target = path.join(tempRoot, "node_modules", packageName);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
}

function run() {
  ensureExists(standaloneRoot, "standalone build output is missing; run `pnpm build` first");

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "huoziwriter-standalone-init-"));
  try {
    fs.cpSync(standaloneRoot, tempRoot, { recursive: true });
    fs.cpSync(path.join(repoRoot, "docker"), path.join(tempRoot, "docker"), { recursive: true });
    fs.cpSync(path.join(repoRoot, "migrations"), path.join(tempRoot, "migrations"), { recursive: true });
    fs.cpSync(path.join(repoRoot, "pg_migrations"), path.join(tempRoot, "pg_migrations"), { recursive: true });

    for (const packageName of ["bcryptjs", "postgres", "bindings", "file-uri-to-path", "better-sqlite3"]) {
      copyPackage(tempRoot, packageName);
    }

    const env = {
      ...process.env,
      DATABASE_PATH: "./data/runtime-smoke.db",
      DATABASE_URL: "",
      DEFAULT_ADMIN_PASSWORD: "Smoke#Huozi42",
    };

    const initOutput = execFileSync(process.execPath, ["docker/runtime-db-init.mjs"], {
      cwd: tempRoot,
      env,
      encoding: "utf8",
    });

    if (!initOutput.includes("runtime-db-init: completed for sqlite")) {
      throw new Error(`unexpected runtime init output: ${initOutput}`);
    }

    execFileSync(
      process.execPath,
      [
        "-e",
        `
          const Database = require('better-sqlite3');
          const db = new Database('./data/runtime-smoke.db');
          const row = db.prepare("SELECT username, role, plan_code FROM users WHERE username = ?").get('huozi');
          if (!row || row.role !== 'admin' || row.plan_code !== 'team') {
            throw new Error('default admin bootstrap verification failed');
          }
          db.close();
        `,
      ],
      {
        cwd: tempRoot,
        env,
        stdio: "pipe",
      },
    );

    process.stdout.write("standalone runtime init smoke: ok\n");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

run();
