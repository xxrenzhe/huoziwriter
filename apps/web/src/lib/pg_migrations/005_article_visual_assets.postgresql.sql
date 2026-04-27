CREATE TABLE IF NOT EXISTS article_visual_briefs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id BIGINT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  article_node_id BIGINT REFERENCES article_nodes(id) ON DELETE SET NULL,
  visual_scope TEXT NOT NULL,
  target_anchor TEXT NOT NULL,
  baoyu_skill TEXT NOT NULL,
  visual_type TEXT NOT NULL,
  layout_code TEXT,
  style_code TEXT,
  palette_code TEXT,
  rendering_code TEXT,
  text_level TEXT,
  mood_code TEXT,
  font_code TEXT,
  aspect_ratio TEXT NOT NULL DEFAULT '16:9',
  output_resolution TEXT NOT NULL DEFAULT '1K',
  title TEXT NOT NULL,
  purpose TEXT NOT NULL,
  alt_text TEXT NOT NULL,
  caption TEXT,
  labels_json JSONB,
  source_facts_json JSONB,
  prompt_text TEXT,
  negative_prompt TEXT,
  prompt_hash TEXT,
  prompt_manifest_json JSONB,
  status TEXT NOT NULL DEFAULT 'planned',
  error_message TEXT,
  generated_asset_file_id BIGINT,
  inserted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, article_id, visual_scope, target_anchor, visual_type)
);

CREATE TABLE IF NOT EXISTS article_image_generation_jobs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id BIGINT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  job_scope TEXT NOT NULL DEFAULT 'article_visuals',
  status TEXT NOT NULL DEFAULT 'pending',
  total_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  job_payload_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE article_image_prompts ADD COLUMN visual_brief_id BIGINT;
ALTER TABLE article_image_prompts ADD COLUMN status TEXT NOT NULL DEFAULT 'prompt_ready';
ALTER TABLE article_image_prompts ADD COLUMN insert_anchor TEXT;
ALTER TABLE article_image_prompts ADD COLUMN alt_text TEXT;
ALTER TABLE article_image_prompts ADD COLUMN caption TEXT;

ALTER TABLE asset_files ADD COLUMN visual_brief_id BIGINT;
ALTER TABLE asset_files ADD COLUMN article_node_id BIGINT;
ALTER TABLE asset_files ADD COLUMN insert_anchor TEXT;
ALTER TABLE asset_files ADD COLUMN alt_text TEXT;
ALTER TABLE asset_files ADD COLUMN caption TEXT;

CREATE INDEX IF NOT EXISTS idx_article_visual_briefs_article ON article_visual_briefs(user_id, article_id, visual_scope, status);
CREATE INDEX IF NOT EXISTS idx_article_visual_assets ON asset_files(user_id, article_id, asset_scope, asset_type);
