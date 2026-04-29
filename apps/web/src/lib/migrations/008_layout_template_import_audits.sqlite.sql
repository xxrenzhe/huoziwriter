CREATE TABLE IF NOT EXISTS layout_template_import_audits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id TEXT NOT NULL,
  version TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  issues_json TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_layout_template_import_audits_template
ON layout_template_import_audits(user_id, template_id, id);
