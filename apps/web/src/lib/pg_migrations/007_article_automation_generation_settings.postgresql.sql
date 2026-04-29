ALTER TABLE article_automation_runs
  ADD COLUMN IF NOT EXISTS generation_settings_json JSONB NOT NULL DEFAULT '{}'::jsonb;
