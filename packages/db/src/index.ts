import path from "node:path";

export type DatabaseType = "sqlite" | "postgres";

export function detectDatabaseType() {
  return process.env.DATABASE_URL ? "postgres" : "sqlite";
}

export function resolveSqliteDatabasePath(cwd: string, configuredPath?: string) {
  return path.resolve(cwd, configuredPath || "./data/huoziwriter.db");
}

export function toPostgresPlaceholders(sql: string) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

export function normalizeSqlParams(params: unknown[]) {
  return params.map((value) => {
    if (typeof value === "boolean") {
      return value ? 1 : 0;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === "object" && value !== null && !Buffer.isBuffer(value)) {
      return JSON.stringify(value);
    }
    return value;
  });
}
