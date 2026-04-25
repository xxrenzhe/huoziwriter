CREATE TABLE IF NOT EXISTS article_automation_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  article_id INTEGER,
  input_mode TEXT NOT NULL,
  input_text TEXT NOT NULL,
  source_url TEXT,
  target_wechat_connection_id INTEGER,
  target_series_id INTEGER,
  automation_level TEXT NOT NULL DEFAULT 'draftPreview',
  status TEXT NOT NULL DEFAULT 'queued',
  current_stage_code TEXT NOT NULL DEFAULT 'topicAnalysis',
  final_wechat_media_id TEXT,
  blocked_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_article_automation_runs_user_updated_at
  ON article_automation_runs(user_id, updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS article_automation_stage_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  article_id INTEGER,
  stage_code TEXT NOT NULL,
  prompt_id TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  scene_code TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  input_json TEXT NOT NULL DEFAULT '{}',
  output_json TEXT NOT NULL DEFAULT '{}',
  quality_json TEXT NOT NULL DEFAULT '{}',
  search_trace_json TEXT NOT NULL DEFAULT '{}',
  error_code TEXT,
  error_message TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (run_id) REFERENCES article_automation_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_article_automation_stage_runs_run_stage
  ON article_automation_stage_runs(run_id, stage_code);

CREATE INDEX IF NOT EXISTS idx_article_automation_stage_runs_run_status
  ON article_automation_stage_runs(run_id, status, id);
