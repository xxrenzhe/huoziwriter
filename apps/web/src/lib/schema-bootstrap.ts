import { STYLE_TEMPLATE_LIBRARY } from "./catalog";
import { getDatabase } from "./db";

async function execAll(statements: string[]) {
  const db = getDatabase();
  for (const statement of statements) {
    await db.exec(statement);
  }
}

async function hasColumn(table: string, column: string) {
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

async function ensureColumn(table: string, column: string, definition: string) {
  if (await hasColumn(table, column)) {
    return;
  }
  await getDatabase().exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

async function ensureTopicSourceScopedUniqueness() {
  const db = getDatabase();

  if (db.type === "sqlite") {
    const tableSql = await db.queryOne<{ sql: string | null }>(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'topic_sources'",
    );
    if (/name\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(tableSql?.sql || "")) {
      await db.exec("ALTER TABLE topic_sources RENAME TO topic_sources_legacy");
      await db.exec(
        `CREATE TABLE topic_sources (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          owner_user_id INTEGER,
          name TEXT NOT NULL,
          homepage_url TEXT,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
      );
      await db.exec(
        `INSERT INTO topic_sources (id, owner_user_id, name, homepage_url, is_active, created_at, updated_at)
         SELECT id, owner_user_id, name, homepage_url, is_active, created_at, updated_at
         FROM topic_sources_legacy`,
      );
      await db.exec("DROP TABLE topic_sources_legacy");
    }

    await db.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_topic_sources_system_name_unique ON topic_sources(name) WHERE owner_user_id IS NULL",
    );
    await db.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_topic_sources_owner_name_unique ON topic_sources(owner_user_id, name) WHERE owner_user_id IS NOT NULL",
    );
    return;
  }

  await db.exec("ALTER TABLE topic_sources DROP CONSTRAINT IF EXISTS topic_sources_name_key");
  await db.exec("DROP INDEX IF EXISTS topic_sources_name_key");
  await db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_topic_sources_system_name_unique ON topic_sources(name) WHERE owner_user_id IS NULL",
  );
  await db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_topic_sources_owner_name_unique ON topic_sources(owner_user_id, name) WHERE owner_user_id IS NOT NULL",
  );
}

export async function ensureExtendedProductSchema() {
  await execAll([
    `CREATE TABLE IF NOT EXISTS document_nodes (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      document_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      parent_node_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      title TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS document_fragment_refs (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      document_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      document_node_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      fragment_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      UNIQUE(document_node_id, fragment_id)
    )`,
    `CREATE TABLE IF NOT EXISTS fragment_sources (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      fragment_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      source_type TEXT NOT NULL,
      source_url TEXT,
      screenshot_path TEXT,
      raw_payload_json TEXT,
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS fragment_embeddings (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      fragment_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL UNIQUE,
      embedding_json TEXT,
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS style_genomes (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      owner_user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      source_genome_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      meta TEXT,
      config_json TEXT NOT NULL,
      is_public ${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "FALSE" : "0"},
      is_official ${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "FALSE" : "0"},
      published_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS style_genome_forks (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      source_genome_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      target_genome_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS knowledge_cards (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      workspace_scope TEXT NOT NULL DEFAULT 'personal',
      card_type TEXT NOT NULL,
      title TEXT NOT NULL,
      slug TEXT NOT NULL,
      summary TEXT,
      key_facts_json TEXT,
      open_questions_json TEXT,
      conflict_flags_json ${getDatabase().type === "postgres" ? "JSONB" : "TEXT"},
      confidence_score REAL NOT NULL DEFAULT 0.5,
      status TEXT NOT NULL DEFAULT 'draft',
      last_compiled_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      last_verified_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      UNIQUE(user_id, slug)
    )`,
    `CREATE TABLE IF NOT EXISTS knowledge_card_fragments (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      knowledge_card_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      fragment_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      relation_type TEXT NOT NULL DEFAULT 'evidence',
      evidence_weight REAL NOT NULL DEFAULT 1,
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS knowledge_card_links (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      source_card_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      target_card_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      link_type TEXT NOT NULL DEFAULT 'mentions',
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS knowledge_card_revisions (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      knowledge_card_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      revision_no INTEGER NOT NULL,
      compiled_payload_json TEXT NOT NULL,
      change_summary TEXT,
      compiled_by_job_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS template_versions (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      template_id TEXT NOT NULL,
      version TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      config_json TEXT NOT NULL,
      is_active ${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "TRUE" : "1"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      UNIQUE(template_id, version)
    )`,
    `CREATE TABLE IF NOT EXISTS cover_images (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      document_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      prompt TEXT NOT NULL,
      image_url TEXT NOT NULL,
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS global_ai_engines (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      engine_code TEXT NOT NULL UNIQUE,
      provider_name TEXT NOT NULL DEFAULT 'custom',
      base_url TEXT NOT NULL,
      api_key_encrypted TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT 'Gemini 3.1 Pro',
      is_enabled ${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "TRUE" : "1"},
      last_checked_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      last_error TEXT,
      updated_by ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS topic_sources (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      name TEXT NOT NULL,
      homepage_url TEXT,
      is_active ${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "TRUE" : "1"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      payload_json TEXT,
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS support_messages (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      issue_type TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      source_page TEXT,
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
  ]);

  await ensureColumn("users", "referral_code", "TEXT");
  await ensureColumn("users", "referred_by_user_id", getDatabase().type === "postgres" ? "BIGINT" : "INTEGER");
  await ensureColumn("users", "referral_bound_at", getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT");
  await ensureColumn("documents", "style_genome_id", getDatabase().type === "postgres" ? "BIGINT" : "INTEGER");
  await ensureColumn("documents", "wechat_template_id", "TEXT");
  await ensureColumn("knowledge_cards", "workspace_scope", "TEXT NOT NULL DEFAULT 'personal'");
  await ensureColumn("knowledge_cards", "conflict_flags_json", getDatabase().type === "postgres" ? "JSONB" : "TEXT");
  await ensureColumn("topic_sources", "owner_user_id", getDatabase().type === "postgres" ? "BIGINT" : "INTEGER");
  await ensureColumn("topic_items", "owner_user_id", getDatabase().type === "postgres" ? "BIGINT" : "INTEGER");
  await ensureTopicSourceScopedUniqueness();
}

export async function ensureMarketplaceSeeds() {
  const db = getDatabase();
  for (const template of STYLE_TEMPLATE_LIBRARY) {
    const genome = await db.queryOne<{ id: number }>("SELECT id FROM style_genomes WHERE code = ?", [template.id]);
    if (!genome) {
      await db.exec(
        `INSERT INTO style_genomes (
          owner_user_id, source_genome_id, code, name, description, meta, config_json, is_public, is_official, published_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          null,
          null,
          template.id,
          template.name,
          template.description,
          template.meta,
          template.config,
          true,
          true,
          new Date().toISOString(),
          new Date().toISOString(),
          new Date().toISOString(),
        ],
      );
    }

    const templateVersion = await db.queryOne<{ id: number }>(
      "SELECT id FROM template_versions WHERE template_id = ? AND version = ?",
      [template.id, "v1.0.0"],
    );
    if (!templateVersion) {
      await db.exec(
        `INSERT INTO template_versions (template_id, version, name, description, config_json, is_active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [template.id, "v1.0.0", template.name, template.description, template.config, true, new Date().toISOString()],
      );
    }
  }

  for (const source of [
    { name: "晚点 LatePost", homepageUrl: "https://www.latepost.com" },
    { name: "36Kr", homepageUrl: "https://36kr.com" },
    { name: "华尔街日报 Wall Street Journal", homepageUrl: "https://www.wsj.com" },
  ]) {
    const exists = await db.queryOne<{ id: number }>(
      "SELECT id FROM topic_sources WHERE owner_user_id IS NULL AND name = ?",
      [source.name],
    );
    if (!exists) {
      await db.exec(
        `INSERT INTO topic_sources (name, homepage_url, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [source.name, source.homepageUrl, true, new Date().toISOString(), new Date().toISOString()],
      );
    }
  }
}
