import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("schema-bootstrap stays a thin orchestrator without inline legacy DDL", () => {
  const sourcePath = path.resolve(process.cwd(), "apps/web/src/lib/schema-bootstrap.ts");
  const source = fs.readFileSync(sourcePath, "utf8");

  assert.match(source, /runPendingMigrations/);
  assert.match(source, /applyLegacySchemaCompat/);
  assert.match(source, /runLegacySchemaPostMigrations/);

  assert.doesNotMatch(source, /\bCREATE\s+TABLE\b/i);
  assert.doesNotMatch(source, /\bALTER\s+TABLE\b/i);
  assert.doesNotMatch(source, /\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(source, /\bDROP\s+COLUMN\b/i);
  assert.doesNotMatch(source, /getDatabase\s*\(/);

  assert.doesNotMatch(source, /await\s+ensureColumn\s*\(/);
  assert.doesNotMatch(source, /await\s+renameColumnIfNeeded\s*\(/);
  assert.doesNotMatch(source, /await\s+renameTableIfNeeded\s*\(/);
  assert.doesNotMatch(source, /await\s+dropTableIfNeeded\s*\(/);
  assert.doesNotMatch(source, /await\s+dropColumnIfNeeded\s*\(/);
  assert.doesNotMatch(source, /await\s+execAll\s*\(/);
});
