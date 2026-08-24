BEGIN;

CREATE TABLE IF NOT EXISTS workspace_document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_profile user_profile NOT NULL,
  schema_version varchar(64) NOT NULL DEFAULT 'barry_workspace_v1',
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_exported_at TIMESTAMP(3) WITH TIME ZONE,
  _created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (
    CASE
      WHEN current_setting('app.user_id', TRUE) = '' THEN NULL
      ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile
    END
  ),
  _updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (
    CASE
      WHEN current_setting('app.user_id', TRUE) = '' THEN NULL
      ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile
    END
  )
);

COMMENT ON TABLE workspace_document IS 'Barry 工作台的单用户主状态文档';
COMMENT ON COLUMN workspace_document.owner_profile IS '工作台所有者的妙搭用户 ID';
COMMENT ON COLUMN workspace_document.state IS '@type Record<string, unknown>';

CREATE UNIQUE INDEX IF NOT EXISTS uk_workspace_document_owner
  ON workspace_document (((owner_profile).user_id));

ALTER TABLE workspace_document ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_bypass_policy ON workspace_document
  AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "仅本人查看工作台" ON workspace_document
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    current_setting('app.user_id', TRUE) = (owner_profile).user_id
  );

CREATE POLICY "仅本人创建工作台" ON workspace_document
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    current_setting('app.user_id', TRUE) = (owner_profile).user_id
  );

CREATE POLICY "仅本人修改工作台" ON workspace_document
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    current_setting('app.user_id', TRUE) = (owner_profile).user_id
  )
  WITH CHECK (
    current_setting('app.user_id', TRUE) = (owner_profile).user_id
  );

CREATE POLICY "仅本人删除工作台" ON workspace_document
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (
    current_setting('app.user_id', TRUE) = (owner_profile).user_id
  );

COMMIT;
