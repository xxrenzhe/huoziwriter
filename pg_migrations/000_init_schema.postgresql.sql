BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  plan_code TEXT NOT NULL DEFAULT 'free',
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plans (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  price_cny INTEGER NOT NULL DEFAULT 0,
  daily_generation_limit INTEGER,
  fragment_limit INTEGER,
  language_guard_rule_limit INTEGER,
  max_wechat_connections INTEGER,
  can_generate_cover_image BOOLEAN NOT NULL DEFAULT FALSE,
  can_export_pdf BOOLEAN NOT NULL DEFAULT FALSE,
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usage_counters (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  counter_key TEXT NOT NULL,
  counter_date DATE NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, counter_key, counter_date)
);

CREATE TABLE IF NOT EXISTS prompt_versions (
  id BIGSERIAL PRIMARY KEY,
  prompt_id TEXT NOT NULL,
  version TEXT NOT NULL,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  file_path TEXT NOT NULL,
  function_name TEXT NOT NULL,
  prompt_content TEXT NOT NULL,
  language TEXT DEFAULT 'zh-CN',
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  change_notes TEXT,
  UNIQUE(prompt_id, version)
);

CREATE TABLE IF NOT EXISTS articles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  markdown_content TEXT NOT NULL DEFAULT '',
  html_content TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  template_version_id BIGINT,
  cover_image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS article_snapshots (
  id BIGSERIAL PRIMARY KEY,
  article_id BIGINT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  markdown_content TEXT NOT NULL,
  html_content TEXT,
  snapshot_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fragments (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  title TEXT,
  raw_content TEXT,
  distilled_content TEXT NOT NULL,
  source_url TEXT,
  screenshot_path TEXT,
  embedding_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS language_guard_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, word)
);

CREATE TABLE IF NOT EXISTS wechat_connections (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_name TEXT,
  original_id TEXT,
  app_id_encrypted TEXT NOT NULL,
  app_secret_encrypted TEXT NOT NULL,
  access_token_encrypted TEXT,
  access_token_expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'invalid',
  last_verified_at TIMESTAMPTZ,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wechat_sync_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id BIGINT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  wechat_connection_id BIGINT NOT NULL REFERENCES wechat_connections(id) ON DELETE CASCADE,
  media_id TEXT,
  status TEXT NOT NULL,
  request_summary JSONB,
  response_summary JSONB,
  failure_reason TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_queue (
  id BIGSERIAL PRIMARY KEY,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  payload_json JSONB NOT NULL,
  run_at TIMESTAMPTZ,
  locked_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_model_routes (
  id BIGSERIAL PRIMARY KEY,
  scene_code TEXT NOT NULL UNIQUE,
  primary_model TEXT NOT NULL,
  fallback_model TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS topic_items (
  id BIGSERIAL PRIMARY KEY,
  owner_user_id BIGINT,
  source_name TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  emotion_labels_json JSONB,
  angle_options_json JSONB,
  source_url TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS source_connectors (
  id BIGSERIAL PRIMARY KEY,
  topic_source_id BIGINT NOT NULL UNIQUE,
  owner_user_id BIGINT,
  connector_scope TEXT NOT NULL DEFAULT 'system',
  name TEXT NOT NULL,
  homepage_url TEXT,
  source_type TEXT NOT NULL DEFAULT 'news',
  priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'healthy',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_http_status INTEGER,
  next_retry_at TIMESTAMPTZ,
  health_score DOUBLE PRECISION NOT NULL DEFAULT 100,
  degraded_reason TEXT,
  last_fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS topic_events (
  id BIGSERIAL PRIMARY KEY,
  event_key TEXT NOT NULL UNIQUE,
  owner_user_id BIGINT,
  canonical_title TEXT NOT NULL,
  summary TEXT,
  emotion_labels_json JSONB NOT NULL,
  angle_options_json JSONB NOT NULL,
  primary_source_name TEXT,
  primary_source_type TEXT NOT NULL DEFAULT 'news',
  primary_source_priority INTEGER NOT NULL DEFAULT 100,
  primary_source_url TEXT,
  source_names_json JSONB NOT NULL,
  source_urls_json JSONB NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  latest_published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hot_event_clusters (
  id BIGSERIAL PRIMARY KEY,
  cluster_key TEXT NOT NULL UNIQUE,
  owner_user_id BIGINT,
  canonical_title TEXT NOT NULL,
  normalized_title TEXT NOT NULL,
  summary TEXT,
  emotion_labels_json JSONB NOT NULL,
  angle_options_json JSONB NOT NULL,
  primary_source_name TEXT,
  primary_source_type TEXT NOT NULL DEFAULT 'news',
  primary_source_priority INTEGER NOT NULL DEFAULT 100,
  primary_source_url TEXT,
  source_names_json JSONB NOT NULL,
  source_urls_json JSONB NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 1,
  freshness_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  authority_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  priority_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  latest_published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hot_event_evidence_items (
  id BIGSERIAL PRIMARY KEY,
  cluster_key TEXT NOT NULL,
  owner_user_id BIGINT,
  topic_item_id BIGINT,
  source_name TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'news',
  source_priority INTEGER NOT NULL DEFAULT 100,
  title TEXT NOT NULL,
  summary TEXT,
  source_url TEXT,
  published_at TIMESTAMPTZ,
  captured_at TIMESTAMPTZ,
  evidence_payload_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(cluster_key, topic_item_id)
);

CREATE TABLE IF NOT EXISTS topic_sync_runs (
  id BIGSERIAL PRIMARY KEY,
  sync_window_start TIMESTAMPTZ NOT NULL UNIQUE,
  sync_window_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  scheduled_source_count INTEGER NOT NULL DEFAULT 0,
  enqueued_job_count INTEGER NOT NULL DEFAULT 0,
  completed_source_count INTEGER NOT NULL DEFAULT 0,
  failed_source_count INTEGER NOT NULL DEFAULT 0,
  inserted_item_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  triggered_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS topic_recommendations (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  recommendation_date TEXT NOT NULL,
  rank_index INTEGER NOT NULL,
  topic_dedup_key TEXT NOT NULL,
  source_topic_id BIGINT,
  source_owner_user_id BIGINT,
  source_name TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'news',
  source_priority INTEGER NOT NULL DEFAULT 100,
  title TEXT NOT NULL,
  summary TEXT,
  emotion_labels_json JSONB NOT NULL,
  angle_options_json JSONB NOT NULL,
  source_url TEXT,
  related_source_names_json JSONB NOT NULL,
  related_source_urls_json JSONB NOT NULL,
  published_at TIMESTAMPTZ,
  recommendation_type TEXT NOT NULL,
  recommendation_reason TEXT NOT NULL,
  matched_persona_id BIGINT,
  matched_persona_name TEXT,
  freshness_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  relevance_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  priority_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, recommendation_date, rank_index),
  UNIQUE(user_id, recommendation_date, topic_dedup_key)
);

CREATE TABLE IF NOT EXISTS article_nodes (
  id BIGSERIAL PRIMARY KEY,
  article_id BIGINT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  parent_node_id BIGINT REFERENCES article_nodes(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS article_fragment_refs (
  id BIGSERIAL PRIMARY KEY,
  article_id BIGINT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  article_node_id BIGINT NOT NULL REFERENCES article_nodes(id) ON DELETE CASCADE,
  fragment_id BIGINT NOT NULL REFERENCES fragments(id) ON DELETE CASCADE,
  usage_mode TEXT NOT NULL DEFAULT 'rewrite',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(article_node_id, fragment_id)
);

CREATE TABLE IF NOT EXISTS article_workflows (
  id BIGSERIAL PRIMARY KEY,
  article_id BIGINT NOT NULL UNIQUE REFERENCES articles(id) ON DELETE CASCADE,
  current_stage_code TEXT NOT NULL DEFAULT 'opportunity',
  stages_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS article_stage_artifacts (
  id BIGSERIAL PRIMARY KEY,
  article_id BIGINT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  stage_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready',
  summary TEXT,
  payload_json JSONB,
  model TEXT,
  provider TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(article_id, stage_code)
);

CREATE TABLE IF NOT EXISTS fragment_sources (
  id BIGSERIAL PRIMARY KEY,
  fragment_id BIGINT NOT NULL REFERENCES fragments(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_url TEXT,
  screenshot_path TEXT,
  raw_payload_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fragment_embeddings (
  id BIGSERIAL PRIMARY KEY,
  fragment_id BIGINT NOT NULL UNIQUE REFERENCES fragments(id) ON DELETE CASCADE,
  embedding_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS layout_strategies (
  id BIGSERIAL PRIMARY KEY,
  owner_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  source_layout_strategy_id BIGINT REFERENCES layout_strategies(id) ON DELETE SET NULL,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  meta TEXT,
  config_json JSONB NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  is_official BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS layout_strategy_forks (
  id BIGSERIAL PRIMARY KEY,
  source_layout_strategy_id BIGINT NOT NULL REFERENCES layout_strategies(id) ON DELETE CASCADE,
  target_layout_strategy_id BIGINT NOT NULL REFERENCES layout_strategies(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS personas (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  identity_tags_json JSONB NOT NULL,
  writing_style_tags_json JSONB NOT NULL,
  summary TEXT,
  domain_keywords_json JSONB,
  argument_preferences_json JSONB,
  tone_constraints_json JSONB,
  audience_hints_json JSONB,
  source_mode TEXT NOT NULL DEFAULT 'manual',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS persona_sources (
  id BIGSERIAL PRIMARY KEY,
  persona_id BIGINT NOT NULL,
  source_type TEXT NOT NULL,
  title TEXT,
  source_url TEXT,
  file_path TEXT,
  extracted_text TEXT,
  analysis_payload_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS persona_tags (
  id BIGSERIAL PRIMARY KEY,
  tag_key TEXT NOT NULL UNIQUE,
  tag_name TEXT NOT NULL,
  tag_type TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_system BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS language_guard_rules (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  rule_kind TEXT NOT NULL,
  match_mode TEXT NOT NULL DEFAULT 'contains',
  pattern_text TEXT NOT NULL,
  rewrite_hint TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS article_reference_articles (
  id BIGSERIAL PRIMARY KEY,
  article_id BIGINT NOT NULL,
  referenced_article_id BIGINT NOT NULL,
  relation_reason TEXT,
  bridge_sentence TEXT,
  sort_order INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(article_id, referenced_article_id)
);

CREATE TABLE IF NOT EXISTS writing_style_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_url TEXT,
  source_title TEXT,
  summary TEXT NOT NULL,
  tone_keywords_json JSONB NOT NULL,
  structure_patterns_json JSONB NOT NULL,
  language_habits_json JSONB NOT NULL,
  opening_patterns_json JSONB NOT NULL,
  ending_patterns_json JSONB NOT NULL,
  do_not_write_json JSONB NOT NULL,
  imitation_prompt TEXT NOT NULL,
  source_excerpt TEXT,
  analysis_payload_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_cards (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_type TEXT NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  summary TEXT,
  key_facts_json JSONB,
  open_questions_json JSONB,
  conflict_flags_json JSONB,
  confidence_score DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'draft',
  last_compiled_at TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, slug)
);

CREATE TABLE IF NOT EXISTS knowledge_card_fragments (
  id BIGSERIAL PRIMARY KEY,
  knowledge_card_id BIGINT NOT NULL REFERENCES knowledge_cards(id) ON DELETE CASCADE,
  fragment_id BIGINT NOT NULL REFERENCES fragments(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL DEFAULT 'evidence',
  evidence_weight DOUBLE PRECISION NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_card_links (
  id BIGSERIAL PRIMARY KEY,
  source_card_id BIGINT NOT NULL REFERENCES knowledge_cards(id) ON DELETE CASCADE,
  target_card_id BIGINT NOT NULL REFERENCES knowledge_cards(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL DEFAULT 'mentions',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_card_revisions (
  id BIGSERIAL PRIMARY KEY,
  knowledge_card_id BIGINT NOT NULL REFERENCES knowledge_cards(id) ON DELETE CASCADE,
  revision_no INTEGER NOT NULL,
  compiled_payload_json JSONB NOT NULL,
  change_summary TEXT,
  compiled_by_job_id BIGINT REFERENCES job_queue(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS template_versions (
  id BIGSERIAL PRIMARY KEY,
  template_id TEXT NOT NULL,
  version TEXT NOT NULL,
  owner_user_id BIGINT,
  name TEXT NOT NULL,
  description TEXT,
  source_url TEXT,
  config_json JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(template_id, version)
);

CREATE TABLE IF NOT EXISTS layout_templates (
  id BIGSERIAL PRIMARY KEY,
  template_id TEXT NOT NULL UNIQUE,
  owner_user_id BIGINT,
  name TEXT NOT NULL,
  description TEXT,
  source_url TEXT,
  meta TEXT,
  visibility_scope TEXT NOT NULL DEFAULT 'official',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS layout_template_versions (
  id BIGSERIAL PRIMARY KEY,
  template_id TEXT NOT NULL,
  version TEXT NOT NULL,
  schema_version TEXT NOT NULL DEFAULT 'v2',
  config_json JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(template_id, version)
);

CREATE TABLE IF NOT EXISTS cover_images (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id BIGINT REFERENCES articles(id) ON DELETE SET NULL,
  prompt TEXT NOT NULL,
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asset_files (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id BIGINT REFERENCES articles(id) ON DELETE SET NULL,
  asset_scope TEXT NOT NULL,
  asset_type TEXT NOT NULL DEFAULT 'cover_image',
  source_record_id BIGINT NOT NULL,
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
  manifest_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(asset_scope, source_record_id)
);

CREATE TABLE IF NOT EXISTS cover_image_candidates (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id BIGINT REFERENCES articles(id) ON DELETE SET NULL,
  batch_token TEXT NOT NULL,
  variant_label TEXT NOT NULL,
  prompt TEXT NOT NULL,
  image_url TEXT NOT NULL,
  is_selected BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  selected_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS article_image_prompts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id BIGINT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  article_node_id BIGINT REFERENCES article_nodes(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL DEFAULT 'inline',
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(article_id, article_node_id, asset_type)
);

CREATE TABLE IF NOT EXISTS global_ai_engines (
  id BIGSERIAL PRIMARY KEY,
  engine_code TEXT NOT NULL,
  provider_name TEXT NOT NULL DEFAULT 'custom',
  base_url TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'Gemini 3.1 Pro',
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_checked_at TIMESTAMPTZ,
  last_error TEXT,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(engine_code)
);

CREATE TABLE IF NOT EXISTS global_object_storage_configs (
  id BIGSERIAL PRIMARY KEY,
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
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_checked_at TIMESTAMPTZ,
  last_error TEXT,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(storage_code)
);

CREATE TABLE IF NOT EXISTS topic_sources (
  id BIGSERIAL PRIMARY KEY,
  owner_user_id BIGINT,
  name TEXT NOT NULL,
  homepage_url TEXT,
  source_type TEXT NOT NULL DEFAULT 'news',
  priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_topic_sources_system_name_unique
ON topic_sources(name)
WHERE owner_user_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_topic_sources_owner_name_unique
ON topic_sources(owner_user_id, name)
WHERE owner_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  payload_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO plans (
  code, name, price_cny, daily_generation_limit, fragment_limit, language_guard_rule_limit,
  max_wechat_connections, can_generate_cover_image, can_export_pdf, is_public
) VALUES
  ('free', '游墨', 0, 1, 50, 5, 0, FALSE, FALSE, TRUE),
  ('pro', '执毫', 108, 10, NULL, NULL, 1, TRUE, FALSE, TRUE),
  ('ultra', '藏锋', 298, NULL, NULL, NULL, 5, TRUE, TRUE, TRUE)
ON CONFLICT (code) DO NOTHING;

INSERT INTO ai_model_routes (scene_code, primary_model, fallback_model, description) VALUES
  ('fragmentDistill', 'gemini-3.0-flash-lite', 'gemini-3.0-flash', '碎片提纯与原子事实抽取'),
  ('visionNote', 'gemini-3.0-flash', 'gpt-5.4-mini', '截图视觉理解与结构化笔记生成'),
  ('articleWrite', 'claude-sonnet-4-6', 'claude-haiku-4-5', '正文生成与改写'),
  ('styleExtract', 'gemini-3.0-flash', 'gpt-5.4-mini', '文章写作风格提取与结构化分析'),
  ('topicSupplement', 'gemini-3.0-flash', 'gpt-5.4-mini', '选题补证信源补充与查询建议生成'),
  ('audienceProfile', 'claude-sonnet-4-6', 'claude-haiku-4-5', '受众画像分析与表达策略生成'),
  ('outlinePlan', 'claude-sonnet-4-6', 'claude-haiku-4-5', '结构化大纲规划与标题策略生成'),
  ('deepWrite', 'claude-sonnet-4-6', 'claude-haiku-4-5', '深度写作执行卡与正文生成策略'),
  ('factCheck', 'gpt-5.4-mini', 'gpt-5.4-nano', '事实核查、风险分级与证据缺口分析'),
  ('prosePolish', 'gpt-5.4-mini', 'gpt-5.4-nano', '文笔润色、语言节奏与表达修订建议'),
  ('languageGuardAudit', 'gpt-5.4-mini', 'gpt-5.4-nano', '死刑词与长句审校'),
  ('layoutExtract', 'gemini-3.0-flash', 'gpt-5.4-mini', '文章排版结构提取与模板 DSL 生成'),
  ('publishGuard', 'gpt-5.4-mini', 'gpt-5.4-nano', '发布前守门检查与风险总结'),
  ('wechatRender', 'wechat-renderer', 'backup-renderer', '微信排版渲染')
ON CONFLICT (scene_code) DO NOTHING;

INSERT INTO prompt_versions (
  prompt_id, version, category, name, description, file_path, function_name, prompt_content, language, is_active, change_notes
) VALUES
  ('fragment_distill', 'v1.0.0', 'evidence', '碎片提纯', '将原始内容转为原子事实碎片', 'system:evidence', 'fragmentDistill', '你是碎片提纯器。保留时间、地点、数据、冲突，不要写空泛总结。', 'zh-CN', TRUE, '初始化版本'),
  ('vision_note', 'v1.0.0', 'evidence', '截图视觉理解', '从截图中提取可复用的事实与上下文', 'system:evidence', 'visionNote', '你是截图理解编辑。必须先看图，再提取正文、数字、图表结论、界面状态和异常信号，输出可复用的写作碎片。', 'zh-CN', TRUE, '初始化版本'),
  ('article_write', 'v1.0.0', 'writing', '正文生成', '根据碎片和大纲生成正文', 'system:writing', 'articleWrite', '你是中文专栏作者。根据节点和碎片生成短句、克制、反机器腔调的正文。', 'zh-CN', TRUE, '初始化版本'),
  ('style_extract', 'v1.0.0', 'analysis', '写作风格提取', '从网页文章中提炼写作风格画像', 'system:analysis', 'styleExtract', '你是中文文风分析师。必须基于正文内容抽取语气、句式、结构、开头结尾习惯和模仿提示，不要空泛赞美。', 'zh-CN', TRUE, '初始化版本'),
  ('topic_supplement', 'v1.0.0', 'analysis', '选题补证', '围绕选题生成补充信源、检索词与补证清单', 'system:analysis', 'topicSupplement', '你是选题补证编辑。围绕一个待写选题，优先推荐 YouTube、Reddit、X、Podcast、Spotify、主流新闻等第一手或近一手信源的补证方向，输出可直接执行的查询词、平台建议与验证清单，不要把模型猜测写成事实。', 'zh-CN', TRUE, '新增二期标准场景码 topicSupplement'),
  ('language_guard_audit', 'v1.0.0', 'review', '死刑词审校', '检查并替换死刑词与长句', 'system:review', 'languageGuardAudit', '你是终审编辑。删除禁用词，保留事实，拆解长句。', 'zh-CN', TRUE, '初始化版本'),
  ('audience_profile', 'v1.0.0', 'analysis', '受众画像', '根据选题、人设和素材生成读者画像与表达建议', 'system:analysis', 'audienceProfile', '你是内容策略编辑。你要为一篇中文内容判断真正应该写给谁看、怎么说他们才会继续读。必须优先给出可执行的读者分层、痛点、动机、表达方式、背景认知分层和通俗度建议，避免空泛人口学描述，避免营销套话。', 'zh-CN', TRUE, '新增二期标准场景码 audienceProfile'),
  ('audience_analysis', 'v1.0.0', 'analysis', '受众分析', '根据选题、人设和素材生成读者画像与表达建议', 'system:analysis', 'audienceAnalysis', '你是内容策略编辑。请基于选题、人设、素材和当前文稿，输出结构化的受众分析，重点给出读者分层、痛点、表达方式与语言通俗度建议。', 'zh-CN', TRUE, '初始化版本'),
  ('outline_plan', 'v1.0.0', 'writing', '大纲规划场景', '根据选题、人设、受众和素材生成结构化大纲', 'system:writing', 'outlinePlan', '你是专栏主编。请基于主题、人设、受众和素材，设计一份真正可写的结构化文章大纲。大纲必须体现核心观点、论证递进、证据挂载、情绪转折、开头策略和结尾动作，不能把信息并列堆砌成目录。', 'zh-CN', TRUE, '新增二期标准场景码 outlinePlan'),
  ('outline_planning', 'v1.0.0', 'writing', '大纲规划', '根据选题、人设、受众和素材生成结构化大纲', 'system:writing', 'outlinePlanning', '你是专栏主编。请基于主题、人设、受众和素材，输出结构化文章大纲，覆盖核心观点、论证路径、情绪转折、开头钩子和结尾收束。', 'zh-CN', TRUE, '初始化版本'),
  ('deep_write', 'v1.0.0', 'writing', '深度写作', '围绕大纲、素材和风格生成写作执行卡', 'system:writing', 'deepWrite', '你是资深专栏写作教练。请基于标题、大纲、素材、人设、受众和禁词约束，输出真正可执行的写作执行卡，明确章节任务、事实锚点、表达约束、情绪节奏和结尾动作，不要空泛复述大纲。', 'zh-CN', TRUE, '新增二期标准场景码 deepWrite'),
  ('fact_check', 'v1.0.0', 'review', '事实核查', '对正文中的事实、数据和案例进行核查提示', 'system:review', 'factCheck', '你是事实核查编辑。请标出正文里需要核查的数据、案例、时间与因果推断，区分已验证、待补证据、风险表述与主观判断。', 'zh-CN', TRUE, '初始化版本'),
  ('prose_polish', 'v1.0.0', 'review', '文笔润色', '对正文的表达方式、节奏和情绪转折给出润色建议', 'system:review', 'prosePolish', '你是终稿润色编辑。请评估正文的表达方式、金句节奏、专业性、通俗度和情绪转折，输出可执行的语言优化建议。', 'zh-CN', TRUE, '初始化版本'),
  ('layout_extract', 'v1.0.0', 'publish', '排版提取', '分析参考文章排版结构并生成模板线索', 'system:publish', 'layoutExtract', '你是微信排版分析师。请从参考文章里提取标题层级、分隔节奏、引用样式、重点标记、推荐区块和整体视觉结构，输出可转成模板 DSL 的结构化线索，不要只做审美评价。', 'zh-CN', TRUE, '新增二期标准场景码 layoutExtract'),
  ('publish_guard', 'v1.0.0', 'publish', '发布守门', '对发布前内容完整度、证据风险和配置缺口做检查', 'system:publish', 'publishGuard', '你是发布守门编辑。请在发布前检查内容是否存在证据缺口、事实高风险、标题与正文不一致、缺少封面或模板、公众号配置缺失等问题，输出结构化阻断项、警告项和放行条件。', 'zh-CN', TRUE, '新增二期标准场景码 publishGuard'),
  ('wechat_render', 'v1.0.0', 'publish', '微信排版器', '将 Markdown 转为适合微信公众号的 HTML', 'system:publish', 'wechatRender', '你是微信排版器。输出适配公众号草稿箱的简洁 HTML。', 'zh-CN', TRUE, '初始化版本')
ON CONFLICT (prompt_id, version) DO NOTHING;

INSERT INTO layout_strategies (
  owner_user_id, source_layout_strategy_id, code, name, description, meta, config_json, is_public, is_official, published_at
) VALUES
  (NULL, NULL, 'latepost-minimal', '晚点极简风', '偏报道感、低修饰、段落克制，适合商业评论和行业观察。', '模板', '{"tone":"克制报道","paragraphLength":"short","titleStyle":"sharp","bannedPunctuation":["！！！"]}'::jsonb, TRUE, TRUE, NOW()),
  (NULL, NULL, 'huozi-editorial', '活字新中式', '强调留白、衬线标题、正文行距宽，适合专栏长文。', '版式', '{"tone":"留白专栏","paragraphLength":"medium","titleStyle":"serif","bannedPunctuation":[]}'::jsonb, TRUE, TRUE, NOW()),
  (NULL, NULL, 'anti-buzzwords', '黑话净化包', '预置空话与对应替换建议，适合在终稿阶段做语言降噪。', '词库', '{"tone":"降噪净化","paragraphLength":"short","titleStyle":"plain","bannedWords":["赋能","底层逻辑","不可否认"]}'::jsonb, TRUE, TRUE, NOW())
ON CONFLICT (code) DO NOTHING;

INSERT INTO template_versions (
  template_id, version, owner_user_id, name, description, source_url, config_json, is_active
) VALUES
  ('latepost-minimal', 'v1.0.0', NULL, '晚点极简风', '偏报道感、低修饰、段落克制，适合商业评论和行业观察。', NULL, '{"tone":"克制报道","paragraphLength":"short","titleStyle":"sharp","bannedPunctuation":["！！！"]}'::jsonb, TRUE),
  ('huozi-editorial', 'v1.0.0', NULL, '活字新中式', '强调留白、衬线标题、正文行距宽，适合专栏长文。', NULL, '{"tone":"留白专栏","paragraphLength":"medium","titleStyle":"serif","bannedPunctuation":[]}'::jsonb, TRUE),
  ('anti-buzzwords', 'v1.0.0', NULL, '黑话净化包', '预置空话与对应替换建议，适合在终稿阶段做语言降噪。', NULL, '{"tone":"降噪净化","paragraphLength":"short","titleStyle":"plain","bannedWords":["赋能","底层逻辑","不可否认"]}'::jsonb, TRUE)
ON CONFLICT (template_id, version) DO NOTHING;

INSERT INTO layout_templates (
  template_id, owner_user_id, name, description, source_url, meta, visibility_scope, is_active
) VALUES
  ('latepost-minimal', NULL, '晚点极简风', '偏报道感、低修饰、段落克制，适合商业评论和行业观察。', NULL, '模板', 'official', TRUE),
  ('huozi-editorial', NULL, '活字新中式', '强调留白、衬线标题、正文行距宽，适合专栏长文。', NULL, '版式', 'official', TRUE),
  ('anti-buzzwords', NULL, '黑话净化包', '预置空话与对应替换建议，适合在终稿阶段做语言降噪。', NULL, '词库', 'official', TRUE)
ON CONFLICT (template_id) DO NOTHING;

INSERT INTO layout_template_versions (
  template_id, version, schema_version, config_json, is_active
) VALUES
  ('latepost-minimal', 'v1.0.0', 'v2', '{"tone":"克制报道","paragraphLength":"short","titleStyle":"sharp","bannedPunctuation":["！！！"]}'::jsonb, TRUE),
  ('huozi-editorial', 'v1.0.0', 'v2', '{"tone":"留白专栏","paragraphLength":"medium","titleStyle":"serif","bannedPunctuation":[]}'::jsonb, TRUE),
  ('anti-buzzwords', 'v1.0.0', 'v2', '{"tone":"降噪净化","paragraphLength":"short","titleStyle":"plain","bannedWords":["赋能","底层逻辑","不可否认"]}'::jsonb, TRUE)
ON CONFLICT (template_id, version) DO NOTHING;

INSERT INTO topic_sources (name, homepage_url, source_type, priority, is_active) VALUES
  ('晚点 LatePost', 'https://www.latepost.com', 'news', 90, TRUE),
  ('36Kr', 'https://36kr.com', 'news', 80, TRUE),
  ('华尔街日报 Wall Street Journal', 'https://www.wsj.com', 'news', 70, TRUE)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS article_research_cards (
  id BIGSERIAL PRIMARY KEY,
  article_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  card_kind TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(article_id, card_kind, sort_order)
);

CREATE TABLE IF NOT EXISTS article_research_card_sources (
  id BIGSERIAL PRIMARY KEY,
  research_card_id BIGINT NOT NULL,
  label TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'manual',
  detail TEXT,
  source_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(research_card_id, sort_order)
);

COMMIT;
