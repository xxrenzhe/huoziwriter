CREATE TABLE IF NOT EXISTS ai_call_observations (
  id BIGSERIAL PRIMARY KEY,
  scene_code TEXT NOT NULL,
  article_id BIGINT,
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  call_mode TEXT NOT NULL DEFAULT 'primary',
  input_tokens INTEGER,
  output_tokens INTEGER,
  cache_creation_tokens INTEGER,
  cache_read_tokens INTEGER,
  latency_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'success',
  error_class TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ai_call_observations
ADD COLUMN IF NOT EXISTS article_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_ai_call_observations_article_scene_created_at
ON ai_call_observations(article_id, scene_code, created_at DESC);
