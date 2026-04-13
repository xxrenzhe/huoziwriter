BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT,
  display_name TEXT,
  referral_code TEXT,
  referred_by_user_id BIGINT,
  referral_bound_at TIMESTAMPTZ,
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
  custom_banned_word_limit INTEGER,
  max_wechat_connections INTEGER,
  can_fork_genomes BOOLEAN NOT NULL DEFAULT FALSE,
  can_publish_genomes BOOLEAN NOT NULL DEFAULT FALSE,
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

CREATE TABLE IF NOT EXISTS documents (
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

CREATE TABLE IF NOT EXISTS document_snapshots (
  id BIGSERIAL PRIMARY KEY,
  document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS banned_words (
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
  document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS document_nodes (
  id BIGSERIAL PRIMARY KEY,
  document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  parent_node_id BIGINT REFERENCES document_nodes(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_fragment_refs (
  id BIGSERIAL PRIMARY KEY,
  document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  document_node_id BIGINT NOT NULL REFERENCES document_nodes(id) ON DELETE CASCADE,
  fragment_id BIGINT NOT NULL REFERENCES fragments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(document_node_id, fragment_id)
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

CREATE TABLE IF NOT EXISTS style_genomes (
  id BIGSERIAL PRIMARY KEY,
  owner_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  source_genome_id BIGINT REFERENCES style_genomes(id) ON DELETE SET NULL,
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

CREATE TABLE IF NOT EXISTS style_genome_forks (
  id BIGSERIAL PRIMARY KEY,
  source_genome_id BIGINT NOT NULL REFERENCES style_genomes(id) ON DELETE CASCADE,
  target_genome_id BIGINT NOT NULL REFERENCES style_genomes(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  name TEXT NOT NULL,
  description TEXT,
  config_json JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(template_id, version)
);

CREATE TABLE IF NOT EXISTS cover_images (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id BIGINT REFERENCES documents(id) ON DELETE SET NULL,
  prompt TEXT NOT NULL,
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

CREATE TABLE IF NOT EXISTS topic_sources (
  id BIGSERIAL PRIMARY KEY,
  owner_user_id BIGINT,
  name TEXT NOT NULL UNIQUE,
  homepage_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
  code, name, price_cny, daily_generation_limit, fragment_limit, custom_banned_word_limit,
  max_wechat_connections, can_fork_genomes, can_publish_genomes, can_generate_cover_image, can_export_pdf, is_public
) VALUES
  ('free', '游墨', 0, 1, 50, 5, 0, FALSE, FALSE, FALSE, FALSE, TRUE),
  ('pro', '执毫', 108, 10, NULL, NULL, 1, TRUE, FALSE, TRUE, FALSE, TRUE),
  ('ultra', '藏锋', 298, NULL, NULL, NULL, 5, TRUE, TRUE, TRUE, TRUE, TRUE),
  ('team', '团队', 0, NULL, NULL, NULL, 20, TRUE, TRUE, TRUE, TRUE, FALSE)
ON CONFLICT (code) DO NOTHING;

INSERT INTO ai_model_routes (scene_code, primary_model, fallback_model, description) VALUES
  ('fragmentDistill', 'gemini-3.0-flash-lite', 'gemini-3.0-flash', '碎片提纯与原子事实抽取'),
  ('visionNote', 'gemini-3.0-flash', 'gpt-5.4-mini', '截图视觉理解与结构化笔记生成'),
  ('documentWrite', 'claude-sonnet-4-6', 'claude-haiku-4-5', '正文生成与改写'),
  ('bannedWordAudit', 'gpt-5.4-mini', 'gpt-5.4-nano', '死刑词与长句审校'),
  ('wechatRender', 'internal-renderer', 'fallback-renderer', '微信排版渲染')
ON CONFLICT (scene_code) DO NOTHING;

INSERT INTO prompt_versions (
  prompt_id, version, category, name, description, file_path, function_name, prompt_content, language, is_active, change_notes
) VALUES
  ('fragment_distill', 'v1.0.0', 'capture', '碎片提纯', '将原始内容转为原子事实碎片', 'system:capture', 'fragmentDistill', '你是碎片提纯器。保留时间、地点、数据、冲突，不要写空泛总结。', 'zh-CN', TRUE, '初始化版本'),
  ('vision_note', 'v1.0.0', 'capture', '截图视觉理解', '从截图中提取可复用的事实与上下文', 'system:capture', 'visionNote', '你是截图理解编辑。必须先看图，再提取正文、数字、图表结论、界面状态和异常信号，输出可复用的写作碎片。', 'zh-CN', TRUE, '初始化版本'),
  ('document_write', 'v1.0.0', 'writing', '正文生成', '根据碎片和大纲生成正文', 'system:writing', 'documentWrite', '你是中文专栏作者。根据节点和碎片生成短句、克制、反机器腔调的正文。', 'zh-CN', TRUE, '初始化版本'),
  ('banned_word_audit', 'v1.0.0', 'review', '死刑词审校', '检查并替换死刑词与长句', 'system:review', 'bannedWordAudit', '你是终审编辑。删除禁用词，保留事实，拆解长句。', 'zh-CN', TRUE, '初始化版本'),
  ('wechat_render', 'v1.0.0', 'publish', '微信排版器', '将 Markdown 转为适合微信公众号的 HTML', 'system:publish', 'wechatRender', '你是微信排版器。输出适配公众号草稿箱的简洁 HTML。', 'zh-CN', TRUE, '初始化版本')
ON CONFLICT (prompt_id, version) DO NOTHING;

INSERT INTO style_genomes (
  owner_user_id, source_genome_id, code, name, description, meta, config_json, is_public, is_official, published_at
) VALUES
  (NULL, NULL, 'latepost-minimal', '晚点极简风', '偏报道感、低修饰、段落克制，适合商业评论和行业观察。', '模板', '{"tone":"克制报道","paragraphLength":"short","titleStyle":"sharp","bannedPunctuation":["！！！"]}'::jsonb, TRUE, TRUE, NOW()),
  (NULL, NULL, 'huozi-editorial', '活字新中式', '强调留白、衬线标题、正文行距宽，适合专栏长文。', '版式', '{"tone":"留白专栏","paragraphLength":"medium","titleStyle":"serif","bannedPunctuation":[]}'::jsonb, TRUE, TRUE, NOW()),
  (NULL, NULL, 'anti-buzzwords', '黑话净化包', '预置空话与对应替换建议，适合在终稿阶段做语言降噪。', '词库', '{"tone":"降噪净化","paragraphLength":"short","titleStyle":"plain","bannedWords":["赋能","底层逻辑","不可否认"]}'::jsonb, TRUE, TRUE, NOW())
ON CONFLICT (code) DO NOTHING;

INSERT INTO template_versions (
  template_id, version, name, description, config_json, is_active
) VALUES
  ('latepost-minimal', 'v1.0.0', '晚点极简风', '偏报道感、低修饰、段落克制，适合商业评论和行业观察。', '{"tone":"克制报道","paragraphLength":"short","titleStyle":"sharp","bannedPunctuation":["！！！"]}'::jsonb, TRUE),
  ('huozi-editorial', 'v1.0.0', '活字新中式', '强调留白、衬线标题、正文行距宽，适合专栏长文。', '{"tone":"留白专栏","paragraphLength":"medium","titleStyle":"serif","bannedPunctuation":[]}'::jsonb, TRUE),
  ('anti-buzzwords', 'v1.0.0', '黑话净化包', '预置空话与对应替换建议，适合在终稿阶段做语言降噪。', '{"tone":"降噪净化","paragraphLength":"short","titleStyle":"plain","bannedWords":["赋能","底层逻辑","不可否认"]}'::jsonb, TRUE)
ON CONFLICT (template_id, version) DO NOTHING;

INSERT INTO topic_sources (name, homepage_url, is_active) VALUES
  ('晚点 LatePost', 'https://www.latepost.com', TRUE),
  ('36Kr', 'https://36kr.com', TRUE)
ON CONFLICT (name) DO NOTHING;

COMMIT;
