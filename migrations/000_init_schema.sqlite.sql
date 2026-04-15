PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT,
  display_name TEXT,
  referral_code TEXT,
  referred_by_user_id INTEGER,
  referral_bound_at TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  plan_code TEXT NOT NULL DEFAULT 'free',
  must_change_password INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  price_cny INTEGER NOT NULL DEFAULT 0,
  daily_generation_limit INTEGER,
  fragment_limit INTEGER,
  custom_banned_word_limit INTEGER,
  max_wechat_connections INTEGER,
  can_fork_genomes INTEGER NOT NULL DEFAULT 0,
  can_publish_genomes INTEGER NOT NULL DEFAULT 0,
  can_generate_cover_image INTEGER NOT NULL DEFAULT 0,
  can_export_pdf INTEGER NOT NULL DEFAULT 0,
  is_public INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  plan_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  start_at TEXT,
  end_at TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS usage_counters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  counter_key TEXT NOT NULL,
  counter_date TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, counter_key, counter_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS prompt_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt_id TEXT NOT NULL,
  version TEXT NOT NULL,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  file_path TEXT NOT NULL,
  function_name TEXT NOT NULL,
  prompt_content TEXT NOT NULL,
  language TEXT DEFAULT 'zh-CN',
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_active INTEGER NOT NULL DEFAULT 0,
  change_notes TEXT,
  UNIQUE(prompt_id, version),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  markdown_content TEXT NOT NULL DEFAULT '',
  html_content TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  template_version_id INTEGER,
  cover_image_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS document_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  markdown_content TEXT NOT NULL,
  html_content TEXT,
  snapshot_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fragments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  title TEXT,
  raw_content TEXT,
  distilled_content TEXT NOT NULL,
  source_url TEXT,
  screenshot_path TEXT,
  embedding_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS banned_words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  word TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, word),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wechat_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  account_name TEXT,
  original_id TEXT,
  app_id_encrypted TEXT NOT NULL,
  app_secret_encrypted TEXT NOT NULL,
  access_token_encrypted TEXT,
  access_token_expires_at TEXT,
  status TEXT NOT NULL DEFAULT 'invalid',
  last_verified_at TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wechat_sync_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  document_id INTEGER NOT NULL,
  wechat_connection_id INTEGER NOT NULL,
  media_id TEXT,
  status TEXT NOT NULL,
  request_summary TEXT,
  response_summary TEXT,
  failure_reason TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (wechat_connection_id) REFERENCES wechat_connections(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS job_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  payload_json TEXT NOT NULL,
  run_at TEXT,
  locked_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_model_routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scene_code TEXT NOT NULL UNIQUE,
  primary_model TEXT NOT NULL,
  fallback_model TEXT,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS topic_sources (
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
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_topic_sources_system_name_unique
ON topic_sources(name)
WHERE owner_user_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_topic_sources_owner_name_unique
ON topic_sources(owner_user_id, name)
WHERE owner_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS source_connectors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_source_id INTEGER NOT NULL UNIQUE,
  owner_user_id INTEGER,
  connector_scope TEXT NOT NULL DEFAULT 'system',
  name TEXT NOT NULL,
  homepage_url TEXT,
  source_type TEXT NOT NULL DEFAULT 'news',
  priority INTEGER NOT NULL DEFAULT 100,
  is_active INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'healthy',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_http_status INTEGER,
  next_retry_at TEXT,
  health_score REAL NOT NULL DEFAULT 100,
  degraded_reason TEXT,
  last_fetched_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS topic_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER,
  source_name TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  emotion_labels_json TEXT,
  angle_options_json TEXT,
  source_url TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS topic_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_key TEXT NOT NULL UNIQUE,
  owner_user_id INTEGER,
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
  first_seen_at TEXT,
  last_seen_at TEXT,
  latest_published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS hot_event_clusters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cluster_key TEXT NOT NULL UNIQUE,
  owner_user_id INTEGER,
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
  first_seen_at TEXT,
  last_seen_at TEXT,
  latest_published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS hot_event_evidence_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cluster_key TEXT NOT NULL,
  owner_user_id INTEGER,
  topic_item_id INTEGER,
  source_name TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'news',
  source_priority INTEGER NOT NULL DEFAULT 100,
  title TEXT NOT NULL,
  summary TEXT,
  source_url TEXT,
  published_at TEXT,
  captured_at TEXT,
  evidence_payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(cluster_key, topic_item_id)
);

CREATE TABLE IF NOT EXISTS topic_sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_window_start TEXT NOT NULL UNIQUE,
  sync_window_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  scheduled_source_count INTEGER NOT NULL DEFAULT 0,
  enqueued_job_count INTEGER NOT NULL DEFAULT 0,
  completed_source_count INTEGER NOT NULL DEFAULT 0,
  failed_source_count INTEGER NOT NULL DEFAULT 0,
  inserted_item_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  triggered_at TEXT NOT NULL,
  finished_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS topic_recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  recommendation_date TEXT NOT NULL,
  rank_index INTEGER NOT NULL,
  topic_dedup_key TEXT NOT NULL,
  source_topic_id INTEGER,
  source_owner_user_id INTEGER,
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
  published_at TEXT,
  recommendation_type TEXT NOT NULL,
  recommendation_reason TEXT NOT NULL,
  matched_persona_id INTEGER,
  matched_persona_name TEXT,
  freshness_score REAL NOT NULL DEFAULT 0,
  relevance_score REAL NOT NULL DEFAULT 0,
  priority_score REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, recommendation_date, rank_index),
  UNIQUE(user_id, recommendation_date, topic_dedup_key)
);

CREATE TABLE IF NOT EXISTS document_nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  parent_node_id INTEGER,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_node_id) REFERENCES document_nodes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS document_fragment_refs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  document_node_id INTEGER NOT NULL,
  fragment_id INTEGER NOT NULL,
  usage_mode TEXT NOT NULL DEFAULT 'rewrite',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(document_node_id, fragment_id),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (document_node_id) REFERENCES document_nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (fragment_id) REFERENCES fragments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS document_workflows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL UNIQUE,
  current_stage_code TEXT NOT NULL DEFAULT 'topicRadar',
  stages_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS document_stage_artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  stage_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready',
  summary TEXT,
  payload_json TEXT,
  model TEXT,
  provider TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(document_id, stage_code),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fragment_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fragment_id INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  source_url TEXT,
  screenshot_path TEXT,
  raw_payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (fragment_id) REFERENCES fragments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fragment_embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fragment_id INTEGER NOT NULL UNIQUE,
  embedding_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (fragment_id) REFERENCES fragments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS style_genomes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER,
  source_genome_id INTEGER,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  meta TEXT,
  config_json TEXT NOT NULL,
  is_public INTEGER NOT NULL DEFAULT 0,
  is_official INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (source_genome_id) REFERENCES style_genomes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS style_genome_forks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_genome_id INTEGER NOT NULL,
  target_genome_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (source_genome_id) REFERENCES style_genomes(id) ON DELETE CASCADE,
  FOREIGN KEY (target_genome_id) REFERENCES style_genomes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS author_personas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  identity_tags_json TEXT NOT NULL,
  writing_style_tags_json TEXT NOT NULL,
  summary TEXT,
  domain_keywords_json TEXT,
  argument_preferences_json TEXT,
  tone_constraints_json TEXT,
  audience_hints_json TEXT,
  source_mode TEXT NOT NULL DEFAULT 'manual',
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, name),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS author_persona_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  persona_id INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  title TEXT,
  source_url TEXT,
  file_path TEXT,
  extracted_text TEXT,
  analysis_payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS persona_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tag_key TEXT NOT NULL UNIQUE,
  tag_name TEXT NOT NULL,
  tag_type TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 100,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_system INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS language_guard_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  rule_kind TEXT NOT NULL,
  match_mode TEXT NOT NULL DEFAULT 'contains',
  pattern_text TEXT NOT NULL,
  rewrite_hint TEXT,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS document_reference_articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  referenced_document_id INTEGER NOT NULL,
  relation_reason TEXT,
  bridge_sentence TEXT,
  sort_order INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(document_id, referenced_document_id)
);

CREATE TABLE IF NOT EXISTS writing_style_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS knowledge_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  workspace_scope TEXT NOT NULL DEFAULT 'personal',
  card_type TEXT NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  summary TEXT,
  key_facts_json TEXT,
  open_questions_json TEXT,
  conflict_flags_json TEXT,
  confidence_score REAL NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'draft',
  last_compiled_at TEXT,
  last_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, slug),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS knowledge_card_fragments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  knowledge_card_id INTEGER NOT NULL,
  fragment_id INTEGER NOT NULL,
  relation_type TEXT NOT NULL DEFAULT 'evidence',
  evidence_weight REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (knowledge_card_id) REFERENCES knowledge_cards(id) ON DELETE CASCADE,
  FOREIGN KEY (fragment_id) REFERENCES fragments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS knowledge_card_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_card_id INTEGER NOT NULL,
  target_card_id INTEGER NOT NULL,
  link_type TEXT NOT NULL DEFAULT 'mentions',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (source_card_id) REFERENCES knowledge_cards(id) ON DELETE CASCADE,
  FOREIGN KEY (target_card_id) REFERENCES knowledge_cards(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS knowledge_card_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  knowledge_card_id INTEGER NOT NULL,
  revision_no INTEGER NOT NULL,
  compiled_payload_json TEXT NOT NULL,
  change_summary TEXT,
  compiled_by_job_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (knowledge_card_id) REFERENCES knowledge_cards(id) ON DELETE CASCADE,
  FOREIGN KEY (compiled_by_job_id) REFERENCES job_queue(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS template_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id TEXT NOT NULL,
  version TEXT NOT NULL,
  owner_user_id INTEGER,
  name TEXT NOT NULL,
  description TEXT,
  source_url TEXT,
  config_json TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(template_id, version)
);

CREATE TABLE IF NOT EXISTS layout_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id TEXT NOT NULL UNIQUE,
  owner_user_id INTEGER,
  name TEXT NOT NULL,
  description TEXT,
  source_url TEXT,
  meta TEXT,
  visibility_scope TEXT NOT NULL DEFAULT 'official',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS layout_template_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id TEXT NOT NULL,
  version TEXT NOT NULL,
  schema_version TEXT NOT NULL DEFAULT 'v2',
  config_json TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(template_id, version)
);

CREATE TABLE IF NOT EXISTS cover_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  document_id INTEGER,
  prompt TEXT NOT NULL,
  image_url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS asset_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  document_id INTEGER,
  asset_scope TEXT NOT NULL,
  asset_type TEXT NOT NULL DEFAULT 'cover_image',
  legacy_asset_id INTEGER NOT NULL,
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
  manifest_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(asset_scope, legacy_asset_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS cover_image_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  document_id INTEGER,
  batch_token TEXT NOT NULL,
  variant_label TEXT NOT NULL,
  prompt TEXT NOT NULL,
  image_url TEXT NOT NULL,
  is_selected INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  selected_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS document_image_prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  document_id INTEGER NOT NULL,
  document_node_id INTEGER,
  asset_type TEXT NOT NULL DEFAULT 'inline',
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(document_id, document_node_id, asset_type),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (document_node_id) REFERENCES document_nodes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS global_ai_engines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  engine_code TEXT NOT NULL,
  provider_name TEXT NOT NULL DEFAULT 'custom',
  base_url TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'Gemini 3.1 Pro',
  is_enabled INTEGER NOT NULL DEFAULT 1,
  last_checked_at TEXT,
  last_error TEXT,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(engine_code),
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS global_object_storage_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  storage_code TEXT NOT NULL,
  provider_name TEXT NOT NULL DEFAULT 'local',
  provider_preset TEXT NOT NULL DEFAULT 'local',
  endpoint TEXT,
  bucket_name TEXT,
  region TEXT NOT NULL DEFAULT 'auto',
  access_key_id TEXT,
  secret_access_key_encrypted TEXT,
  public_base_url TEXT,
  path_prefix TEXT,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  last_checked_at TEXT,
  last_error TEXT,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(storage_code),
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

INSERT OR IGNORE INTO plans (
  code, name, price_cny, daily_generation_limit, fragment_limit, custom_banned_word_limit,
  max_wechat_connections, can_fork_genomes, can_publish_genomes, can_generate_cover_image, can_export_pdf, is_public
) VALUES
  ('free', '游墨', 0, 1, 50, 5, 0, 0, 0, 0, 0, 1),
  ('pro', '执毫', 108, 10, NULL, NULL, 1, 1, 0, 1, 0, 1),
  ('ultra', '藏锋', 298, NULL, NULL, NULL, 5, 1, 1, 1, 1, 1);

INSERT OR IGNORE INTO ai_model_routes (scene_code, primary_model, fallback_model, description) VALUES
  ('fragmentDistill', 'gemini-3.0-flash-lite', 'gemini-3.0-flash', '碎片提纯与原子事实抽取'),
  ('visionNote', 'gemini-3.0-flash', 'gpt-5.4-mini', '截图视觉理解与结构化笔记生成'),
  ('documentWrite', 'claude-sonnet-4-6', 'claude-haiku-4-5', '正文生成与改写'),
  ('styleExtract', 'gemini-3.0-flash', 'gpt-5.4-mini', '文章写作风格提取与结构化分析'),
  ('topicSupplement', 'gemini-3.0-flash', 'gpt-5.4-mini', '选题补证信源补充与查询建议生成'),
  ('topicSourceScout', 'gemini-3.0-flash', 'gpt-5.4-mini', '选题雷达补充信源建议与补证线索生成'),
  ('audienceProfile', 'claude-sonnet-4-6', 'claude-haiku-4-5', '受众画像分析与表达策略生成'),
  ('outlinePlan', 'claude-sonnet-4-6', 'claude-haiku-4-5', '结构化大纲规划与标题策略生成'),
  ('deepWrite', 'claude-sonnet-4-6', 'claude-haiku-4-5', '深度写作执行卡与正文生成策略'),
  ('factCheck', 'gpt-5.4-mini', 'gpt-5.4-nano', '事实核查、风险分级与证据缺口分析'),
  ('prosePolish', 'gpt-5.4-mini', 'gpt-5.4-nano', '文笔润色、语言节奏与表达修订建议'),
  ('bannedWordAudit', 'gpt-5.4-mini', 'gpt-5.4-nano', '死刑词与长句审校'),
  ('layoutExtract', 'gemini-3.0-flash', 'gpt-5.4-mini', '文章排版结构提取与模板 DSL 生成'),
  ('publishGuard', 'gpt-5.4-mini', 'gpt-5.4-nano', '发布前守门检查与风险总结'),
  ('wechatRender', 'internal-renderer', 'fallback-renderer', '微信排版渲染');

INSERT OR IGNORE INTO prompt_versions (
  prompt_id, version, category, name, description, file_path, function_name, prompt_content, language, is_active, change_notes
) VALUES
  ('fragment_distill', 'v1.0.0', 'capture', '碎片提纯', '将原始内容转为原子事实碎片', 'system:capture', 'fragmentDistill', '你是碎片提纯器。保留时间、地点、数据、冲突，不要写空泛总结。', 'zh-CN', 1, '初始化版本'),
  ('vision_note', 'v1.0.0', 'capture', '截图视觉理解', '从截图中提取可复用的事实与上下文', 'system:capture', 'visionNote', '你是截图理解编辑。必须先看图，再提取正文、数字、图表结论、界面状态和异常信号，输出可复用的写作碎片。', 'zh-CN', 1, '初始化版本'),
  ('document_write', 'v1.0.0', 'writing', '正文生成', '根据碎片和大纲生成正文', 'system:writing', 'documentWrite', '你是中文专栏作者。根据节点和碎片生成短句、克制、反机器腔调的正文。', 'zh-CN', 1, '初始化版本'),
  ('style_extract', 'v1.0.0', 'analysis', '写作风格提取', '从网页文章中提炼写作风格画像', 'system:analysis', 'styleExtract', '你是中文文风分析师。必须基于正文内容抽取语气、句式、结构、开头结尾习惯和模仿提示，不要空泛赞美。', 'zh-CN', 1, '初始化版本'),
  ('topic_supplement', 'v1.0.0', 'analysis', '选题补证', '围绕选题生成补充信源、检索词与补证清单', 'system:analysis', 'topicSupplement', '你是选题补证编辑。围绕一个待写选题，优先推荐 YouTube、Reddit、X、Podcast、Spotify、主流新闻等第一手或近一手信源的补证方向，输出可直接执行的查询词、平台建议与验证清单，不要把模型猜测写成事实。', 'zh-CN', 1, '新增二期标准场景码 topicSupplement'),
  ('banned_word_audit', 'v1.0.0', 'review', '死刑词审校', '检查并替换死刑词与长句', 'system:review', 'bannedWordAudit', '你是终审编辑。删除禁用词，保留事实，拆解长句。', 'zh-CN', 1, '初始化版本'),
  ('audience_profile', 'v1.0.0', 'analysis', '受众画像', '根据选题、人设和素材生成读者画像与表达建议', 'system:analysis', 'audienceProfile', '你是内容策略编辑。你要为一篇中文内容判断真正应该写给谁看、怎么说他们才会继续读。必须优先给出可执行的读者分层、痛点、动机、表达方式、背景认知分层和通俗度建议，避免空泛人口学描述，避免营销套话。', 'zh-CN', 1, '新增二期标准场景码 audienceProfile'),
  ('audience_analysis', 'v1.0.0', 'analysis', '受众分析', '根据选题、人设和素材生成读者画像与表达建议', 'system:analysis', 'audienceAnalysis', '你是内容策略编辑。请基于选题、人设、素材和当前文稿，输出结构化的受众分析，重点给出读者分层、痛点、表达方式与语言通俗度建议。', 'zh-CN', 1, '初始化版本'),
  ('outline_plan', 'v1.0.0', 'writing', '大纲规划场景', '根据选题、人设、受众和素材生成结构化大纲', 'system:writing', 'outlinePlan', '你是专栏主编。请基于主题、人设、受众和素材，设计一份真正可写的结构化文章大纲。大纲必须体现核心观点、论证递进、证据挂载、情绪转折、开头策略和结尾动作，不能把信息并列堆砌成目录。', 'zh-CN', 1, '新增二期标准场景码 outlinePlan'),
  ('outline_planning', 'v1.0.0', 'writing', '大纲规划', '根据选题、人设、受众和素材生成结构化大纲', 'system:writing', 'outlinePlanning', '你是专栏主编。请基于主题、人设、受众和素材，输出结构化文章大纲，覆盖核心观点、论证路径、情绪转折、开头钩子和结尾收束。', 'zh-CN', 1, '初始化版本'),
  ('deep_write', 'v1.0.0', 'writing', '深度写作', '围绕大纲、素材和风格生成写作执行卡', 'system:writing', 'deepWrite', '你是资深专栏写作教练。请基于标题、大纲、素材、人设、受众和禁词约束，输出真正可执行的写作执行卡，明确章节任务、事实锚点、表达约束、情绪节奏和结尾动作，不要空泛复述大纲。', 'zh-CN', 1, '新增二期标准场景码 deepWrite'),
  ('fact_check', 'v1.0.0', 'review', '事实核查', '对正文中的事实、数据和案例进行核查提示', 'system:review', 'factCheck', '你是事实核查编辑。请标出正文里需要核查的数据、案例、时间与因果推断，区分已验证、待补证据、风险表述与主观判断。', 'zh-CN', 1, '初始化版本'),
  ('prose_polish', 'v1.0.0', 'review', '文笔润色', '对正文的表达方式、节奏和情绪转折给出润色建议', 'system:review', 'prosePolish', '你是终稿润色编辑。请评估正文的表达方式、金句节奏、专业性、通俗度和情绪转折，输出可执行的语言优化建议。', 'zh-CN', 1, '初始化版本'),
  ('layout_extract', 'v1.0.0', 'publish', '排版提取', '分析参考文章排版结构并生成模板线索', 'system:publish', 'layoutExtract', '你是微信排版分析师。请从参考文章里提取标题层级、分隔节奏、引用样式、重点标记、推荐区块和整体视觉结构，输出可转成模板 DSL 的结构化线索，不要只做审美评价。', 'zh-CN', 1, '新增二期标准场景码 layoutExtract'),
  ('publish_guard', 'v1.0.0', 'publish', '发布守门', '对发布前内容完整度、证据风险和配置缺口做检查', 'system:publish', 'publishGuard', '你是发布守门编辑。请在发布前检查内容是否存在证据缺口、事实高风险、标题与正文不一致、缺少封面或模板、公众号配置缺失等问题，输出结构化阻断项、警告项和放行条件。', 'zh-CN', 1, '新增二期标准场景码 publishGuard'),
  ('wechat_render', 'v1.0.0', 'publish', '微信排版器', '将 Markdown 转为适合微信公众号的 HTML', 'system:publish', 'wechatRender', '你是微信排版器。输出适配公众号草稿箱的简洁 HTML。', 'zh-CN', 1, '初始化版本');

INSERT OR IGNORE INTO style_genomes (
  owner_user_id, source_genome_id, code, name, description, meta, config_json, is_public, is_official, published_at
) VALUES
  (NULL, NULL, 'latepost-minimal', '晚点极简风', '偏报道感、低修饰、段落克制，适合商业评论和行业观察。', '模板', '{"tone":"克制报道","paragraphLength":"short","titleStyle":"sharp","bannedPunctuation":["！！！"]}', 1, 1, datetime('now')),
  (NULL, NULL, 'huozi-editorial', '活字新中式', '强调留白、衬线标题、正文行距宽，适合专栏长文。', '版式', '{"tone":"留白专栏","paragraphLength":"medium","titleStyle":"serif","bannedPunctuation":[]}', 1, 1, datetime('now')),
  (NULL, NULL, 'anti-buzzwords', '黑话净化包', '预置空话与对应替换建议，适合在终稿阶段做语言降噪。', '词库', '{"tone":"降噪净化","paragraphLength":"short","titleStyle":"plain","bannedWords":["赋能","底层逻辑","不可否认"]}', 1, 1, datetime('now'));

INSERT OR IGNORE INTO template_versions (
  template_id, version, owner_user_id, name, description, source_url, config_json, is_active
) VALUES
  ('latepost-minimal', 'v1.0.0', NULL, '晚点极简风', '偏报道感、低修饰、段落克制，适合商业评论和行业观察。', NULL, '{"tone":"克制报道","paragraphLength":"short","titleStyle":"sharp","bannedPunctuation":["！！！"]}', 1),
  ('huozi-editorial', 'v1.0.0', NULL, '活字新中式', '强调留白、衬线标题、正文行距宽，适合专栏长文。', NULL, '{"tone":"留白专栏","paragraphLength":"medium","titleStyle":"serif","bannedPunctuation":[]}', 1),
  ('anti-buzzwords', 'v1.0.0', NULL, '黑话净化包', '预置空话与对应替换建议，适合在终稿阶段做语言降噪。', NULL, '{"tone":"降噪净化","paragraphLength":"short","titleStyle":"plain","bannedWords":["赋能","底层逻辑","不可否认"]}', 1);

INSERT OR IGNORE INTO layout_templates (
  template_id, owner_user_id, name, description, source_url, meta, visibility_scope, is_active
) VALUES
  ('latepost-minimal', NULL, '晚点极简风', '偏报道感、低修饰、段落克制，适合商业评论和行业观察。', NULL, '模板', 'official', 1),
  ('huozi-editorial', NULL, '活字新中式', '强调留白、衬线标题、正文行距宽，适合专栏长文。', NULL, '版式', 'official', 1),
  ('anti-buzzwords', NULL, '黑话净化包', '预置空话与对应替换建议，适合在终稿阶段做语言降噪。', NULL, '词库', 'official', 1);

INSERT OR IGNORE INTO layout_template_versions (
  template_id, version, schema_version, config_json, is_active
) VALUES
  ('latepost-minimal', 'v1.0.0', 'v2', '{"tone":"克制报道","paragraphLength":"short","titleStyle":"sharp","bannedPunctuation":["！！！"]}', 1),
  ('huozi-editorial', 'v1.0.0', 'v2', '{"tone":"留白专栏","paragraphLength":"medium","titleStyle":"serif","bannedPunctuation":[]}', 1),
  ('anti-buzzwords', 'v1.0.0', 'v2', '{"tone":"降噪净化","paragraphLength":"short","titleStyle":"plain","bannedWords":["赋能","底层逻辑","不可否认"]}', 1);

INSERT OR IGNORE INTO topic_sources (name, homepage_url, source_type, priority, is_active) VALUES
  ('晚点 LatePost', 'https://www.latepost.com', 'news', 90, 1),
  ('36Kr', 'https://36kr.com', 'news', 80, 1),
  ('华尔街日报 Wall Street Journal', 'https://www.wsj.com', 'news', 70, 1);

COMMIT;
