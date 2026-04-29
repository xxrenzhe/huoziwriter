ALTER TABLE article_automation_runs
  ADD COLUMN generation_settings_json TEXT NOT NULL DEFAULT '{}';
