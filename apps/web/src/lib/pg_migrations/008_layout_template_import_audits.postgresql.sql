CREATE TABLE IF NOT EXISTS layout_template_import_audits (
  id BIGSERIAL PRIMARY KEY,
  template_id TEXT NOT NULL,
  version TEXT NOT NULL,
  user_id BIGINT NOT NULL,
  status TEXT NOT NULL,
  issues_json JSONB NOT NULL,
  summary_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_layout_template_import_audits_template
ON layout_template_import_audits(user_id, template_id, id);
