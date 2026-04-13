import fs from "node:fs";
import Database from "better-sqlite3";
import postgres from "postgres";
import {
  detectDatabaseType,
  normalizeSqlParams,
  resolveSqliteDatabasePath,
  toPostgresPlaceholders,
  type DatabaseType,
} from "@huoziwriter/db";

export interface DatabaseAdapter {
  type: DatabaseType;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  exec(sql: string, params?: unknown[]): Promise<{ changes: number; lastInsertRowid?: number }>;
  close(): Promise<void>;
}

type PostgresClient = postgres.Sql<Record<string, never>>;

let sqliteInstance: SQLiteAdapter | null = null;
let postgresInstance: PostgresAdapter | null = null;

function ensureSqliteDir(dbPath: string) {
  const dir = require("node:path").dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function sqliteDbPath() {
  return resolveSqliteDatabasePath(process.cwd(), process.env.DATABASE_PATH);
}

class SQLiteAdapter implements DatabaseAdapter {
  type: DatabaseType = "sqlite";
  private db: Database.Database;

  constructor(dbPath: string) {
    ensureSqliteDir(dbPath);
    this.db = new Database(dbPath);
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
  }

  async query<T>(sql: string, params: unknown[] = []) {
    return this.db.prepare(sql).all(...normalizeSqlParams(params)) as T[];
  }

  async queryOne<T>(sql: string, params: unknown[] = []) {
    return this.db.prepare(sql).get(...normalizeSqlParams(params)) as T | undefined;
  }

  async exec(sql: string, params: unknown[] = []) {
    const info = this.db.prepare(sql).run(...normalizeSqlParams(params));
    return {
      changes: info.changes,
      lastInsertRowid: Number(info.lastInsertRowid),
    };
  }

  async close() {
    this.db.close();
  }
}

class PostgresAdapter implements DatabaseAdapter {
  type: DatabaseType = "postgres";
  private client: PostgresClient;

  constructor(connectionString: string) {
    this.client = postgres(connectionString, {
      max: 5,
      idle_timeout: 20,
    }) as PostgresClient;
  }

  async query<T>(sql: string, params: unknown[] = []) {
    const converted = toPostgresPlaceholders(sql);
    const result = await this.client.unsafe(converted, params as never[]);
    return result as unknown as T[];
  }

  async queryOne<T>(sql: string, params: unknown[] = []) {
    const rows = await this.query<T>(sql, params);
    return rows[0];
  }

  async exec(sql: string, params: unknown[] = []) {
    const isInsert = /^\s*insert\s+/i.test(sql);
    const hasReturning = /\breturning\b/i.test(sql);
    const converted = toPostgresPlaceholders(isInsert && !hasReturning ? `${sql} RETURNING id` : sql);
    const result = await this.client.unsafe(converted, params as never[]);
    const first = (result as Array<{ count?: number; id?: number }>)[0];
    return {
      changes: Number(result.count ?? first?.count ?? (first ? 1 : 0)),
      lastInsertRowid: typeof first?.id === "number" ? first.id : undefined,
    };
  }

  async close() {
    await this.client.end();
  }
}

export function getDatabase(): DatabaseAdapter {
  const type = detectDatabaseType();
  if (type === "sqlite") {
    sqliteInstance ??= new SQLiteAdapter(sqliteDbPath());
    return sqliteInstance;
  }

  postgresInstance ??= new PostgresAdapter(process.env.DATABASE_URL!);
  return postgresInstance;
}

export async function closeDatabase() {
  if (sqliteInstance) {
    await sqliteInstance.close();
    sqliteInstance = null;
  }
  if (postgresInstance) {
    await postgresInstance.close();
    postgresInstance = null;
  }
}
