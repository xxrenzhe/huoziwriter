import { STYLE_TEMPLATE_LIBRARY } from "./catalog";
import { syncLegacyCoverAssetsToAssetFiles } from "./asset-files";
import { getDatabase } from "./db";
import { syncLegacyTemplateVersionsToLayoutTemplates, syncTemplateVersionToLayoutTemplates } from "./layout-templates";
import { syncPersonaCatalogToPersonaTags } from "./persona-tags";
import { syncLegacyTopicSourcesToSourceConnectors, syncTopicSourceToSourceConnector } from "./source-connectors";

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
          source_type TEXT NOT NULL DEFAULT 'news',
          priority INTEGER NOT NULL DEFAULT 100,
          is_active INTEGER NOT NULL DEFAULT 1,
          last_fetched_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
      );
      await db.exec(
        `INSERT INTO topic_sources (id, owner_user_id, name, homepage_url, source_type, priority, is_active, last_fetched_at, created_at, updated_at)
         SELECT id, owner_user_id, name, homepage_url, 'news', 100, is_active, NULL, created_at, updated_at
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
      usage_mode TEXT NOT NULL DEFAULT 'rewrite',
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      UNIQUE(document_node_id, fragment_id)
    )`,
    `CREATE TABLE IF NOT EXISTS document_workflows (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      document_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL UNIQUE,
      current_stage_code TEXT NOT NULL DEFAULT 'topicRadar',
      stages_json TEXT NOT NULL,
      pending_publish_intent_json ${getDatabase().type === "postgres" ? "JSONB" : "TEXT"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS document_stage_artifacts (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      document_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      stage_code TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ready',
      summary TEXT,
      payload_json TEXT,
      model TEXT,
      provider TEXT,
      error_message TEXT,
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      UNIQUE(document_id, stage_code)
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
    `CREATE TABLE IF NOT EXISTS author_personas (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      name TEXT NOT NULL,
      identity_tags_json TEXT NOT NULL,
      writing_style_tags_json TEXT NOT NULL,
      bound_writing_style_profile_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      summary TEXT,
      domain_keywords_json TEXT,
      argument_preferences_json TEXT,
      tone_constraints_json TEXT,
      audience_hints_json TEXT,
      source_mode TEXT NOT NULL DEFAULT 'manual',
      is_default ${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "FALSE" : "0"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      UNIQUE(user_id, name)
    )`,
    `CREATE TABLE IF NOT EXISTS author_persona_sources (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      persona_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      source_type TEXT NOT NULL,
      title TEXT,
      source_url TEXT,
      file_path TEXT,
      extracted_text TEXT,
      analysis_payload_json TEXT,
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS persona_tags (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      tag_key TEXT NOT NULL UNIQUE,
      tag_name TEXT NOT NULL,
      tag_type TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 100,
      is_active ${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "TRUE" : "1"},
      is_system ${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "TRUE" : "1"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS language_guard_rules (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      rule_kind TEXT NOT NULL,
      match_mode TEXT NOT NULL DEFAULT 'contains',
      pattern_text TEXT NOT NULL,
      rewrite_hint TEXT,
      is_enabled ${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "TRUE" : "1"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS document_reference_articles (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      document_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      referenced_document_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      relation_reason TEXT,
      bridge_sentence TEXT,
      sort_order INTEGER NOT NULL DEFAULT 1,
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      UNIQUE(document_id, referenced_document_id)
    )`,
    `CREATE TABLE IF NOT EXISTS writing_style_profiles (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      name TEXT NOT NULL,
      source_url TEXT,
      source_title TEXT,
      summary TEXT NOT NULL,
      tone_keywords_json TEXT NOT NULL,
      structure_patterns_json TEXT NOT NULL,
      language_habits_json TEXT NOT NULL,
      opening_patterns_json TEXT NOT NULL,
      ending_patterns_json TEXT NOT NULL,
      do_not_write_json TEXT NOT NULL,
      imitation_prompt TEXT NOT NULL,
      source_excerpt TEXT,
      analysis_payload_json TEXT,
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS first_success_guides (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL UNIQUE,
      completed_steps_json TEXT,
      guide_config_json ${getDatabase().type === "postgres" ? "JSONB" : "TEXT"},
      dismissed_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      last_viewed_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
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
      latest_change_summary TEXT,
      overturned_judgements_json TEXT,
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
      owner_user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      name TEXT NOT NULL,
      description TEXT,
      source_url TEXT,
      config_json TEXT NOT NULL,
      is_active ${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "TRUE" : "1"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      UNIQUE(template_id, version)
    )`,
    `CREATE TABLE IF NOT EXISTS layout_templates (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      template_id TEXT NOT NULL UNIQUE,
      owner_user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      name TEXT NOT NULL,
      description TEXT,
      source_url TEXT,
      meta TEXT,
      visibility_scope TEXT NOT NULL DEFAULT 'official',
      is_active ${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "TRUE" : "1"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS layout_template_versions (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      template_id TEXT NOT NULL,
      version TEXT NOT NULL,
      schema_version TEXT NOT NULL DEFAULT 'v2',
      config_json TEXT NOT NULL,
      is_active ${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "TRUE" : "1"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
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
    `CREATE TABLE IF NOT EXISTS asset_files (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      document_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      asset_scope TEXT NOT NULL,
      asset_type TEXT NOT NULL DEFAULT 'cover_image',
      legacy_asset_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      batch_token TEXT,
      variant_label TEXT,
      storage_provider TEXT,
      public_url TEXT,
      original_object_key TEXT,
      compressed_object_key TEXT,
      thumbnail_object_key TEXT,
      mime_type TEXT,
      byte_length INTEGER,
      status TEXT NOT NULL DEFAULT 'ready',
      manifest_json ${getDatabase().type === "postgres" ? "JSONB" : "TEXT"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      UNIQUE(asset_scope, legacy_asset_id)
    )`,
    `CREATE TABLE IF NOT EXISTS cover_image_candidates (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      document_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      batch_token TEXT NOT NULL,
      variant_label TEXT NOT NULL,
      prompt TEXT NOT NULL,
      image_url TEXT NOT NULL,
      is_selected ${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "FALSE" : "0"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      selected_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"}
    )`,
    `CREATE TABLE IF NOT EXISTS document_image_prompts (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      document_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      document_node_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      asset_type TEXT NOT NULL DEFAULT 'inline',
      title TEXT NOT NULL,
      prompt TEXT NOT NULL,
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      UNIQUE(document_id, document_node_id, asset_type)
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
    `CREATE TABLE IF NOT EXISTS global_object_storage_configs (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      storage_code TEXT NOT NULL UNIQUE,
      provider_name TEXT NOT NULL DEFAULT 'local',
      provider_preset TEXT NOT NULL DEFAULT 'local',
      endpoint TEXT,
      bucket_name TEXT,
      region TEXT NOT NULL DEFAULT 'auto',
      access_key_id TEXT,
      secret_access_key_encrypted TEXT,
      public_base_url TEXT,
      path_prefix TEXT,
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
      source_type TEXT NOT NULL DEFAULT 'news',
      priority ${getDatabase().type === "postgres" ? "INTEGER" : "INTEGER"} NOT NULL DEFAULT 100,
      is_active ${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "TRUE" : "1"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS source_connectors (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      topic_source_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL UNIQUE,
      owner_user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      connector_scope TEXT NOT NULL DEFAULT 'system',
      name TEXT NOT NULL,
      homepage_url TEXT,
      source_type TEXT NOT NULL DEFAULT 'news',
      priority INTEGER NOT NULL DEFAULT 100,
      is_active ${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "TRUE" : "1"},
      status TEXT NOT NULL DEFAULT 'healthy',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      last_http_status INTEGER,
      next_retry_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      health_score REAL NOT NULL DEFAULT 100,
      degraded_reason TEXT,
      last_fetched_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS topic_events (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      event_key TEXT NOT NULL UNIQUE,
      owner_user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      canonical_title TEXT NOT NULL,
      summary TEXT,
      emotion_labels_json TEXT NOT NULL,
      angle_options_json TEXT NOT NULL,
      primary_source_name TEXT,
      primary_source_type TEXT NOT NULL DEFAULT 'news',
      primary_source_priority INTEGER NOT NULL DEFAULT 100,
      primary_source_url TEXT,
      source_names_json TEXT NOT NULL,
      source_urls_json TEXT NOT NULL,
      item_count INTEGER NOT NULL DEFAULT 1,
      first_seen_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      last_seen_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      latest_published_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS hot_event_clusters (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      cluster_key TEXT NOT NULL UNIQUE,
      owner_user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      canonical_title TEXT NOT NULL,
      normalized_title TEXT NOT NULL,
      summary TEXT,
      emotion_labels_json TEXT NOT NULL,
      angle_options_json TEXT NOT NULL,
      primary_source_name TEXT,
      primary_source_type TEXT NOT NULL DEFAULT 'news',
      primary_source_priority INTEGER NOT NULL DEFAULT 100,
      primary_source_url TEXT,
      source_names_json TEXT NOT NULL,
      source_urls_json TEXT NOT NULL,
      item_count INTEGER NOT NULL DEFAULT 1,
      freshness_score REAL NOT NULL DEFAULT 0,
      authority_score REAL NOT NULL DEFAULT 0,
      priority_score REAL NOT NULL DEFAULT 0,
      first_seen_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      last_seen_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      latest_published_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS hot_event_evidence_items (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      cluster_key TEXT NOT NULL,
      owner_user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      topic_item_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      source_name TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'news',
      source_priority INTEGER NOT NULL DEFAULT 100,
      title TEXT NOT NULL,
      summary TEXT,
      source_url TEXT,
      published_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      captured_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      evidence_payload_json TEXT,
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      UNIQUE(cluster_key, topic_item_id)
    )`,
    `CREATE TABLE IF NOT EXISTS topic_sync_runs (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      sync_window_start ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL UNIQUE,
      sync_window_label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      scheduled_source_count INTEGER NOT NULL DEFAULT 0,
      enqueued_job_count INTEGER NOT NULL DEFAULT 0,
      completed_source_count INTEGER NOT NULL DEFAULT 0,
      failed_source_count INTEGER NOT NULL DEFAULT 0,
      inserted_item_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      triggered_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL,
      finished_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS topic_recommendations (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      recommendation_date TEXT NOT NULL,
      rank_index INTEGER NOT NULL,
      topic_dedup_key TEXT NOT NULL,
      source_topic_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      source_owner_user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      source_name TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'news',
      source_priority INTEGER NOT NULL DEFAULT 100,
      title TEXT NOT NULL,
      summary TEXT,
      emotion_labels_json TEXT NOT NULL,
      angle_options_json TEXT NOT NULL,
      source_url TEXT,
      related_source_names_json TEXT NOT NULL,
      related_source_urls_json TEXT NOT NULL,
      published_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      recommendation_type TEXT NOT NULL,
      recommendation_reason TEXT NOT NULL,
      matched_persona_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      matched_persona_name TEXT,
      freshness_score REAL NOT NULL DEFAULT 0,
      relevance_score REAL NOT NULL DEFAULT 0,
      priority_score REAL NOT NULL DEFAULT 0,
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      UNIQUE(user_id, recommendation_date, rank_index),
      UNIQUE(user_id, recommendation_date, topic_dedup_key)
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
  await ensureColumn("author_personas", "bound_writing_style_profile_id", getDatabase().type === "postgres" ? "BIGINT" : "INTEGER");
  await ensureColumn("author_personas", "summary", "TEXT");
  await ensureColumn("author_personas", "domain_keywords_json", "TEXT");
  await ensureColumn("author_personas", "argument_preferences_json", "TEXT");
  await ensureColumn("author_personas", "tone_constraints_json", "TEXT");
  await ensureColumn("author_personas", "audience_hints_json", "TEXT");
  await ensureColumn("author_personas", "source_mode", "TEXT NOT NULL DEFAULT 'manual'");
  await ensureColumn("persona_tags", "description", "TEXT");
  await ensureColumn("persona_tags", "sort_order", "INTEGER NOT NULL DEFAULT 100");
  await ensureColumn("persona_tags", "is_active", `${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "TRUE" : "1"}`);
  await ensureColumn("persona_tags", "is_system", `${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "TRUE" : "1"}`);
  await ensureColumn("knowledge_cards", "workspace_scope", "TEXT NOT NULL DEFAULT 'personal'");
  await ensureColumn("knowledge_cards", "conflict_flags_json", getDatabase().type === "postgres" ? "JSONB" : "TEXT");
  await ensureColumn("knowledge_cards", "latest_change_summary", "TEXT");
  await ensureColumn("knowledge_cards", "overturned_judgements_json", getDatabase().type === "postgres" ? "JSONB" : "TEXT");
  await ensureColumn("first_success_guides", "guide_config_json", getDatabase().type === "postgres" ? "JSONB" : "TEXT");
  await ensureColumn("document_fragment_refs", "usage_mode", "TEXT NOT NULL DEFAULT 'rewrite'");
  await ensureColumn("document_workflows", "pending_publish_intent_json", getDatabase().type === "postgres" ? "JSONB" : "TEXT");
  await ensureColumn("wechat_sync_logs", "failure_code", "TEXT");
  await ensureColumn("wechat_sync_logs", "document_version_hash", "TEXT");
  await ensureColumn("wechat_sync_logs", "template_id", "TEXT");
  await ensureColumn("wechat_sync_logs", "idempotency_key", "TEXT");
  await ensureColumn("global_object_storage_configs", "provider_preset", "TEXT NOT NULL DEFAULT 'local'");
  await ensureColumn("topic_sources", "owner_user_id", getDatabase().type === "postgres" ? "BIGINT" : "INTEGER");
  await ensureColumn("topic_sources", "last_fetched_at", getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT");
  await ensureColumn("topic_sources", "source_type", "TEXT NOT NULL DEFAULT 'news'");
  await ensureColumn("topic_sources", "priority", "INTEGER NOT NULL DEFAULT 100");
  await ensureColumn("source_connectors", "owner_user_id", getDatabase().type === "postgres" ? "BIGINT" : "INTEGER");
  await ensureColumn("source_connectors", "connector_scope", "TEXT NOT NULL DEFAULT 'system'");
  await ensureColumn("source_connectors", "homepage_url", "TEXT");
  await ensureColumn("source_connectors", "source_type", "TEXT NOT NULL DEFAULT 'news'");
  await ensureColumn("source_connectors", "priority", "INTEGER NOT NULL DEFAULT 100");
  await ensureColumn("source_connectors", "is_active", `${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "TRUE" : "1"}`);
  await ensureColumn("source_connectors", "status", "TEXT NOT NULL DEFAULT 'healthy'");
  await ensureColumn("source_connectors", "attempt_count", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("source_connectors", "consecutive_failures", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("source_connectors", "last_error", "TEXT");
  await ensureColumn("source_connectors", "last_http_status", "INTEGER");
  await ensureColumn("source_connectors", "next_retry_at", getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT");
  await ensureColumn("source_connectors", "health_score", "REAL NOT NULL DEFAULT 100");
  await ensureColumn("source_connectors", "degraded_reason", "TEXT");
  await ensureColumn("source_connectors", "last_fetched_at", getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT");
  await ensureColumn("topic_items", "owner_user_id", getDatabase().type === "postgres" ? "BIGINT" : "INTEGER");
  await ensureColumn("topic_recommendations", "source_owner_user_id", getDatabase().type === "postgres" ? "BIGINT" : "INTEGER");
  await ensureColumn("topic_recommendations", "emotion_labels_json", "TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn("topic_recommendations", "angle_options_json", "TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn("topic_recommendations", "related_source_names_json", "TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn("topic_recommendations", "related_source_urls_json", "TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn("topic_recommendations", "freshness_score", "REAL NOT NULL DEFAULT 0");
  await ensureColumn("topic_recommendations", "relevance_score", "REAL NOT NULL DEFAULT 0");
  await ensureColumn("topic_recommendations", "priority_score", "REAL NOT NULL DEFAULT 0");
  await ensureColumn("hot_event_clusters", "owner_user_id", getDatabase().type === "postgres" ? "BIGINT" : "INTEGER");
  await ensureColumn("hot_event_clusters", "normalized_title", "TEXT NOT NULL DEFAULT ''");
  await ensureColumn("hot_event_clusters", "emotion_labels_json", "TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn("hot_event_clusters", "angle_options_json", "TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn("hot_event_clusters", "source_names_json", "TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn("hot_event_clusters", "source_urls_json", "TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn("hot_event_clusters", "freshness_score", "REAL NOT NULL DEFAULT 0");
  await ensureColumn("hot_event_clusters", "authority_score", "REAL NOT NULL DEFAULT 0");
  await ensureColumn("hot_event_clusters", "priority_score", "REAL NOT NULL DEFAULT 0");
  await ensureColumn("hot_event_evidence_items", "owner_user_id", getDatabase().type === "postgres" ? "BIGINT" : "INTEGER");
  await ensureColumn("hot_event_evidence_items", "topic_item_id", getDatabase().type === "postgres" ? "BIGINT" : "INTEGER");
  await ensureColumn("hot_event_evidence_items", "source_type", "TEXT NOT NULL DEFAULT 'news'");
  await ensureColumn("hot_event_evidence_items", "source_priority", "INTEGER NOT NULL DEFAULT 100");
  await ensureColumn("hot_event_evidence_items", "published_at", getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT");
  await ensureColumn("hot_event_evidence_items", "captured_at", getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT");
  await ensureColumn("hot_event_evidence_items", "evidence_payload_json", "TEXT");
  await ensureColumn("hot_event_evidence_items", "updated_at", `${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}`);
  await ensureColumn("template_versions", "owner_user_id", getDatabase().type === "postgres" ? "BIGINT" : "INTEGER");
  await ensureColumn("template_versions", "source_url", "TEXT");
  await ensureColumn("layout_templates", "owner_user_id", getDatabase().type === "postgres" ? "BIGINT" : "INTEGER");
  await ensureColumn("layout_templates", "description", "TEXT");
  await ensureColumn("layout_templates", "source_url", "TEXT");
  await ensureColumn("layout_templates", "meta", "TEXT");
  await ensureColumn("layout_templates", "visibility_scope", "TEXT NOT NULL DEFAULT 'official'");
  await ensureColumn("layout_templates", "is_active", `${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "TRUE" : "1"}`);
  await ensureColumn("layout_templates", "created_at", `${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}`);
  await ensureColumn("layout_templates", "updated_at", `${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}`);
  await ensureColumn("layout_template_versions", "schema_version", "TEXT NOT NULL DEFAULT 'v2'");
  await ensureColumn("layout_template_versions", "config_json", "TEXT NOT NULL DEFAULT '{}'");
  await ensureColumn("layout_template_versions", "is_active", `${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "TRUE" : "1"}`);
  await ensureColumn("layout_template_versions", "created_at", `${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}`);
  await ensureColumn("layout_template_versions", "updated_at", `${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}`);
  await ensureColumn("cover_images", "storage_provider", "TEXT");
  await ensureColumn("cover_images", "original_object_key", "TEXT");
  await ensureColumn("cover_images", "compressed_object_key", "TEXT");
  await ensureColumn("cover_images", "thumbnail_object_key", "TEXT");
  await ensureColumn("cover_images", "asset_manifest_json", getDatabase().type === "postgres" ? "JSONB" : "TEXT");
  await ensureColumn("cover_image_candidates", "storage_provider", "TEXT");
  await ensureColumn("cover_image_candidates", "original_object_key", "TEXT");
  await ensureColumn("cover_image_candidates", "compressed_object_key", "TEXT");
  await ensureColumn("cover_image_candidates", "thumbnail_object_key", "TEXT");
  await ensureColumn("cover_image_candidates", "asset_manifest_json", getDatabase().type === "postgres" ? "JSONB" : "TEXT");
  await ensureColumn("asset_files", "document_id", getDatabase().type === "postgres" ? "BIGINT" : "INTEGER");
  await ensureColumn("asset_files", "asset_type", "TEXT NOT NULL DEFAULT 'cover_image'");
  await ensureColumn("asset_files", "batch_token", "TEXT");
  await ensureColumn("asset_files", "variant_label", "TEXT");
  await ensureColumn("asset_files", "storage_provider", "TEXT");
  await ensureColumn("asset_files", "public_url", "TEXT");
  await ensureColumn("asset_files", "original_object_key", "TEXT");
  await ensureColumn("asset_files", "compressed_object_key", "TEXT");
  await ensureColumn("asset_files", "thumbnail_object_key", "TEXT");
  await ensureColumn("asset_files", "mime_type", "TEXT");
  await ensureColumn("asset_files", "byte_length", "INTEGER");
  await ensureColumn("asset_files", "status", "TEXT NOT NULL DEFAULT 'ready'");
  await ensureColumn("asset_files", "manifest_json", getDatabase().type === "postgres" ? "JSONB" : "TEXT");
  await ensureColumn("asset_files", "updated_at", `${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}`);
  await ensureTopicSourceScopedUniqueness();
  await ensureColumn("topic_sources", "source_type", "TEXT NOT NULL DEFAULT 'news'");
  await ensureColumn("topic_sources", "priority", "INTEGER NOT NULL DEFAULT 100");
  await ensureColumn("topic_sources", "last_fetched_at", getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT");
  await syncLegacyTopicSourcesToSourceConnectors();
  await syncLegacyCoverAssetsToAssetFiles();
  await syncPersonaCatalogToPersonaTags();
  await syncLegacyTemplateVersionsToLayoutTemplates();
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
    await syncTemplateVersionToLayoutTemplates({
      templateId: template.id,
      version: "v1.0.0",
      ownerUserId: null,
      name: template.name,
      description: template.description,
      sourceUrl: null,
      meta: template.meta,
      config: template.config,
      isActive: true,
    });
  }

  for (const source of [
    { name: "YouTube Official Blog", homepageUrl: "https://blog.youtube/", sourceType: "youtube", priority: 98 },
    { name: "Reddit r/technology", homepageUrl: "https://www.reddit.com/r/technology/", sourceType: "reddit", priority: 96 },
    { name: "The Vergecast RSS", homepageUrl: "https://feeds.megaphone.fm/vergecast", sourceType: "podcast", priority: 94 },
    { name: "Spotify Newsroom Podcasts", homepageUrl: "https://newsroom.spotify.com/category/podcasts/", sourceType: "spotify", priority: 92 },
    { name: "晚点 LatePost", homepageUrl: "https://www.latepost.com", sourceType: "news", priority: 90 },
    { name: "OpenAI News", homepageUrl: "https://openai.com/news/", sourceType: "blog", priority: 88 },
    { name: "GitHub Changelog Feed", homepageUrl: "https://github.blog/changelog/feed/", sourceType: "rss", priority: 86 },
    { name: "36Kr", homepageUrl: "https://36kr.com", sourceType: "news", priority: 80 },
    { name: "华尔街日报 Wall Street Journal", homepageUrl: "https://www.wsj.com", sourceType: "news", priority: 70 },
  ]) {
    const exists = await db.queryOne<{ id: number }>(
      "SELECT id FROM topic_sources WHERE owner_user_id IS NULL AND name = ?",
      [source.name],
    );
    if (!exists) {
      await db.exec(
        `INSERT INTO topic_sources (name, homepage_url, source_type, priority, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [source.name, source.homepageUrl, source.sourceType, source.priority, true, new Date().toISOString(), new Date().toISOString()],
      );
    }
    const currentSource = await db.queryOne<{
      id: number;
      owner_user_id: number | null;
      name: string;
      homepage_url: string | null;
      source_type: string | null;
      priority: number | null;
      is_active: number | boolean;
      last_fetched_at: string | null;
    }>(
      `SELECT id, owner_user_id, name, homepage_url, source_type, priority, is_active, last_fetched_at
       FROM topic_sources
       WHERE owner_user_id IS NULL AND name = ?`,
      [source.name],
    );
    if (currentSource) {
      await syncTopicSourceToSourceConnector({
        topicSourceId: currentSource.id,
        ownerUserId: currentSource.owner_user_id,
        name: currentSource.name,
        homepageUrl: currentSource.homepage_url,
        sourceType: currentSource.source_type,
        priority: currentSource.priority,
        isActive: Boolean(currentSource.is_active),
        lastFetchedAt: currentSource.last_fetched_at,
      });
    }
  }
}
