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
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_topic_sources_system_name_unique
ON topic_sources(name)
WHERE owner_user_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_topic_sources_owner_name_unique
ON topic_sources(owner_user_id, name)
WHERE owner_user_id IS NOT NULL;

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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(document_node_id, fragment_id),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (document_node_id) REFERENCES document_nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (fragment_id) REFERENCES fragments(id) ON DELETE CASCADE
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
  name TEXT NOT NULL,
  description TEXT,
  config_json TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
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
  ('ultra', '藏锋', 298, NULL, NULL, NULL, 5, 1, 1, 1, 1, 1),
  ('team', '团队', 0, NULL, NULL, NULL, 20, 1, 1, 1, 1, 0);

INSERT OR IGNORE INTO ai_model_routes (scene_code, primary_model, fallback_model, description) VALUES
  ('fragmentDistill', 'gemini-3.0-flash-lite', 'gemini-3.0-flash', '碎片提纯与原子事实抽取'),
  ('visionNote', 'gemini-3.0-flash', 'gpt-5.4-mini', '截图视觉理解与结构化笔记生成'),
  ('documentWrite', 'claude-sonnet-4-6', 'claude-haiku-4-5', '正文生成与改写'),
  ('bannedWordAudit', 'gpt-5.4-mini', 'gpt-5.4-nano', '死刑词与长句审校'),
  ('wechatRender', 'internal-renderer', 'fallback-renderer', '微信排版渲染');

INSERT OR IGNORE INTO prompt_versions (
  prompt_id, version, category, name, description, file_path, function_name, prompt_content, language, is_active, change_notes
) VALUES
  ('fragment_distill', 'v1.0.0', 'capture', '碎片提纯', '将原始内容转为原子事实碎片', 'system:capture', 'fragmentDistill', '你是碎片提纯器。保留时间、地点、数据、冲突，不要写空泛总结。', 'zh-CN', 1, '初始化版本'),
  ('vision_note', 'v1.0.0', 'capture', '截图视觉理解', '从截图中提取可复用的事实与上下文', 'system:capture', 'visionNote', '你是截图理解编辑。必须先看图，再提取正文、数字、图表结论、界面状态和异常信号，输出可复用的写作碎片。', 'zh-CN', 1, '初始化版本'),
  ('document_write', 'v1.0.0', 'writing', '正文生成', '根据碎片和大纲生成正文', 'system:writing', 'documentWrite', '你是中文专栏作者。根据节点和碎片生成短句、克制、反机器腔调的正文。', 'zh-CN', 1, '初始化版本'),
  ('banned_word_audit', 'v1.0.0', 'review', '死刑词审校', '检查并替换死刑词与长句', 'system:review', 'bannedWordAudit', '你是终审编辑。删除禁用词，保留事实，拆解长句。', 'zh-CN', 1, '初始化版本'),
  ('wechat_render', 'v1.0.0', 'publish', '微信排版器', '将 Markdown 转为适合微信公众号的 HTML', 'system:publish', 'wechatRender', '你是微信排版器。输出适配公众号草稿箱的简洁 HTML。', 'zh-CN', 1, '初始化版本');

INSERT OR IGNORE INTO style_genomes (
  owner_user_id, source_genome_id, code, name, description, meta, config_json, is_public, is_official, published_at
) VALUES
  (NULL, NULL, 'latepost-minimal', '晚点极简风', '偏报道感、低修饰、段落克制，适合商业评论和行业观察。', '模板', '{"tone":"克制报道","paragraphLength":"short","titleStyle":"sharp","bannedPunctuation":["！！！"]}', 1, 1, datetime('now')),
  (NULL, NULL, 'huozi-editorial', '活字新中式', '强调留白、衬线标题、正文行距宽，适合专栏长文。', '版式', '{"tone":"留白专栏","paragraphLength":"medium","titleStyle":"serif","bannedPunctuation":[]}', 1, 1, datetime('now')),
  (NULL, NULL, 'anti-buzzwords', '黑话净化包', '预置空话与对应替换建议，适合在终稿阶段做语言降噪。', '词库', '{"tone":"降噪净化","paragraphLength":"short","titleStyle":"plain","bannedWords":["赋能","底层逻辑","不可否认"]}', 1, 1, datetime('now'));

INSERT OR IGNORE INTO template_versions (
  template_id, version, name, description, config_json, is_active
) VALUES
  ('latepost-minimal', 'v1.0.0', '晚点极简风', '偏报道感、低修饰、段落克制，适合商业评论和行业观察。', '{"tone":"克制报道","paragraphLength":"short","titleStyle":"sharp","bannedPunctuation":["！！！"]}', 1),
  ('huozi-editorial', 'v1.0.0', '活字新中式', '强调留白、衬线标题、正文行距宽，适合专栏长文。', '{"tone":"留白专栏","paragraphLength":"medium","titleStyle":"serif","bannedPunctuation":[]}', 1),
  ('anti-buzzwords', 'v1.0.0', '黑话净化包', '预置空话与对应替换建议，适合在终稿阶段做语言降噪。', '{"tone":"降噪净化","paragraphLength":"short","titleStyle":"plain","bannedWords":["赋能","底层逻辑","不可否认"]}', 1);

INSERT OR IGNORE INTO topic_sources (name, homepage_url, is_active) VALUES
  ('晚点 LatePost', 'https://www.latepost.com', 1),
  ('36Kr', 'https://36kr.com', 1),
  ('华尔街日报 Wall Street Journal', 'https://www.wsj.com', 1);

COMMIT;
