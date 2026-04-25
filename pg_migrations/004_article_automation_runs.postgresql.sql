CREATE TABLE IF NOT EXISTS article_automation_runs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id BIGINT REFERENCES articles(id) ON DELETE SET NULL,
  input_mode TEXT NOT NULL,
  input_text TEXT NOT NULL,
  source_url TEXT,
  target_wechat_connection_id BIGINT,
  target_series_id BIGINT,
  automation_level TEXT NOT NULL DEFAULT 'draftPreview',
  status TEXT NOT NULL DEFAULT 'queued',
  current_stage_code TEXT NOT NULL DEFAULT 'topicAnalysis',
  final_wechat_media_id TEXT,
  blocked_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_article_automation_runs_user_updated_at
  ON article_automation_runs(user_id, updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS article_automation_stage_runs (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES article_automation_runs(id) ON DELETE CASCADE,
  article_id BIGINT REFERENCES articles(id) ON DELETE SET NULL,
  stage_code TEXT NOT NULL,
  prompt_id TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  scene_code TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  input_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  quality_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  search_trace_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_code TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(run_id, stage_code)
);

CREATE INDEX IF NOT EXISTS idx_article_automation_stage_runs_run_status
  ON article_automation_stage_runs(run_id, status, id);
