import { runPendingMigrations } from "./db-migrations";
import {
  dropColumnIfNeeded,
  dropTableIfNeeded,
  ensureColumn,
  execAll,
  hasColumn,
  hasTable,
  renameColumnIfNeeded,
  renameTableIfNeeded,
  replaceTextInColumn,
} from "./schema-bootstrap-db-utils";
import {
  applyLegacySchemaCompat,
  ensureTemplateLibrarySeeds as ensureTemplateLibrarySeedData,
  runLegacySchemaPostMigrations,
} from "./schema-bootstrap-legacy";

type CachedBootTask = {
  key: string;
  promise: Promise<void>;
};

let runtimeMigrationsTask: CachedBootTask | null = null;
let extendedSchemaTask: CachedBootTask | null = null;

function getCurrentDatabaseCacheKey() {
  if (process.env.DATABASE_URL) {
    return `postgres:${process.env.DATABASE_URL}:${process.env.DATABASE_SCHEMA || "public"}`;
  }
  return `sqlite:${process.cwd()}:${process.env.DATABASE_PATH || ".local/state/huoziwriter.db"}`;
}

async function ensureRuntimeMigrations() {
  const key = getCurrentDatabaseCacheKey();
  if (!runtimeMigrationsTask || runtimeMigrationsTask.key !== key) {
    const promise = runPendingMigrations()
      .then(() => undefined)
      .catch((error) => {
        if (runtimeMigrationsTask?.key === key) {
          runtimeMigrationsTask = null;
        }
        throw error;
      });
    runtimeMigrationsTask = { key, promise };
  }
  await runtimeMigrationsTask.promise;
}

async function ensureExtendedProductSchemaInternal() {
  await ensureRuntimeMigrations();
  await applyLegacySchemaCompat({
    execAll,
    ensureColumn,
    renameColumnIfNeeded,
    renameTableIfNeeded,
    dropTableIfNeeded,
    dropColumnIfNeeded,
    hasTable,
    hasColumn,
    replaceTextInColumn,
  });
  await runLegacySchemaPostMigrations();
}

export async function ensureExtendedProductSchema() {
  const key = getCurrentDatabaseCacheKey();
  if (!extendedSchemaTask || extendedSchemaTask.key !== key) {
    const promise = ensureExtendedProductSchemaInternal()
      .catch((error) => {
        if (extendedSchemaTask?.key === key) {
          extendedSchemaTask = null;
        }
        throw error;
      });
    extendedSchemaTask = { key, promise };
  }
  await extendedSchemaTask.promise;
}

export async function ensureTemplateLibrarySeeds() {
  await ensureTemplateLibrarySeedData();
}
