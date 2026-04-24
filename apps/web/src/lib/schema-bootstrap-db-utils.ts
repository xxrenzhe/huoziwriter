import { getDatabase } from "./db";

export type SchemaBootstrapCompatHelpers = {
  hasColumn: (table: string, column: string) => Promise<boolean>;
  hasTable: (table: string) => Promise<boolean>;
  replaceTextInColumn: (table: string, column: string, replacements: Array<[string, string]>) => Promise<void>;
};

export type SchemaBootstrapMutationHelpers = SchemaBootstrapCompatHelpers & {
  execAll: (statements: string[]) => Promise<void>;
  ensureColumn: (table: string, column: string, definition: string) => Promise<void>;
  renameColumnIfNeeded: (table: string, from: string, to: string) => Promise<void>;
  renameTableIfNeeded: (from: string, to: string) => Promise<void>;
  dropTableIfNeeded: (table: string) => Promise<void>;
  dropColumnIfNeeded: (table: string, column: string) => Promise<void>;
};

export async function execAll(statements: string[]) {
  const db = getDatabase();
  for (const statement of statements) {
    await db.exec(statement);
  }
}

export async function hasColumn(table: string, column: string) {
  const db = getDatabase();
  if (db.type === "sqlite") {
    const columns = await db.query<{ name: string }>(`PRAGMA table_info(${table})`);
    return columns.some((item) => item.name === column);
  }

  const result = await db.queryOne<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ? AND column_name = ?`,
    [table, column],
  );
  return Boolean(result);
}

export async function hasTable(table: string) {
  const db = getDatabase();
  if (db.type === "sqlite") {
    const row = await db.queryOne<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      [table],
    );
    return Boolean(row);
  }

  const result = await db.queryOne<{ table_name: string }>(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ?`,
    [table],
  );
  return Boolean(result);
}

export async function ensureColumn(table: string, column: string, definition: string) {
  if (await hasColumn(table, column)) {
    return;
  }
  const db = getDatabase();
  const hasDynamicTimestampDefault =
    /(?:^|\s)DEFAULT\s+(\(datetime\('now'\)\)|datetime\('now'\)|NOW\(\)|CURRENT_TIMESTAMP)(?:\s|$)/i.test(definition);
  if (db.type === "sqlite" && hasDynamicTimestampDefault) {
    const baseType = (definition.match(/^[A-Z]+/i)?.[0] || "TEXT").toUpperCase();
    await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${baseType}`);
    await db.exec(`UPDATE ${table} SET ${column} = CURRENT_TIMESTAMP WHERE ${column} IS NULL`);
    return;
  }
  await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export async function renameColumnIfNeeded(table: string, from: string, to: string) {
  if (await hasColumn(table, to) || !(await hasColumn(table, from))) {
    return;
  }
  const db = getDatabase();
  await db.exec(`ALTER TABLE ${table} RENAME COLUMN ${from} TO ${to}`);
}

export async function renameTableIfNeeded(from: string, to: string) {
  if (await hasTable(to) || !(await hasTable(from))) {
    return;
  }
  const db = getDatabase();
  await db.exec(`ALTER TABLE ${from} RENAME TO ${to}`);
}

export async function dropTableIfNeeded(table: string) {
  if (!(await hasTable(table))) {
    return;
  }
  const db = getDatabase();
  try {
    await db.exec(`DROP TABLE ${table}`);
  } catch {
    // Ignore on engines or environments that cannot drop the legacy table in-place.
  }
}

export async function dropColumnIfNeeded(table: string, column: string) {
  if (!(await hasColumn(table, column))) {
    return;
  }
  const db = getDatabase();
  try {
    await db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
  } catch {
    // Ignore on engines that cannot drop columns in-place; the field stays inert.
  }
}

export async function replaceTextInColumn(table: string, column: string, replacements: Array<[string, string]>) {
  if (!(await hasTable(table)) || !(await hasColumn(table, column)) || replacements.length === 0) {
    return;
  }
  const db = getDatabase();
  const expression = replacements.reduce(
    (current, [from, to]) => `REPLACE(${current}, '${from.replaceAll("'", "''")}', '${to.replaceAll("'", "''")}')`,
    column,
  );
  await db.exec(
    `UPDATE ${table}
     SET ${column} = ${expression}
     WHERE ${column} IS NOT NULL`,
  );
}
