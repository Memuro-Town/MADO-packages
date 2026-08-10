-- 認証用ユーザーテーブル（prisma/schema.prisma の User モデルと完全一致させること）
-- オフラインサーバーでの適用例:
--   psql -U <ユーザー> -d <データベース> -f auth_init.sql
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  login_id      TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  department    TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'staff',
  password_hash TEXT NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 権限グループの割り当て（期限つき）
CREATE TABLE IF NOT EXISTS permission_grants (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  group_id    TEXT NOT NULL,
  expires_at  TIMESTAMP(3) NOT NULL,
  granted_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  granted_by  TEXT NOT NULL,
  reason      TEXT,
  revoked_at  TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS permission_grants_user_id_idx ON permission_grants(user_id);
CREATE INDEX IF NOT EXISTS permission_grants_group_id_idx ON permission_grants(group_id);
CREATE INDEX IF NOT EXISTS permission_grants_expires_at_idx ON permission_grants(expires_at);

-- 臨時の追加・除外
CREATE TABLE IF NOT EXISTS permission_exceptions (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  effect      TEXT NOT NULL,
  table_name  TEXT NOT NULL,
  column_name TEXT NOT NULL,
  expires_at  TIMESTAMP(3) NOT NULL,
  granted_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  granted_by  TEXT NOT NULL,
  reason      TEXT NOT NULL,
  revoked_at  TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS permission_exceptions_user_id_idx ON permission_exceptions(user_id);
CREATE INDEX IF NOT EXISTS permission_exceptions_expires_at_idx ON permission_exceptions(expires_at);

-- 管理画面の操作記録
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id           SERIAL PRIMARY KEY,
  at           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_login  TEXT NOT NULL,
  actor_name   TEXT NOT NULL,
  actor_dept   TEXT NOT NULL,
  action       TEXT NOT NULL,
  target_login TEXT,
  detail       JSONB NOT NULL,
  ip           TEXT,
  user_agent   TEXT
);
CREATE INDEX IF NOT EXISTS admin_audit_log_at_idx ON admin_audit_log(at);
CREATE INDEX IF NOT EXISTS admin_audit_log_actor_login_idx ON admin_audit_log(actor_login);
CREATE INDEX IF NOT EXISTS admin_audit_log_target_login_idx ON admin_audit_log(target_login);

-- 住民情報の閲覧・検索を記録する監査ログ（管理画面の操作記録とは別テーブル）
CREATE TABLE IF NOT EXISTS audit_log (
  id                SERIAL PRIMARY KEY,
  at                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_login       TEXT NOT NULL,
  actor_name        TEXT NOT NULL,
  actor_dept        TEXT NOT NULL,
  action            TEXT NOT NULL,
  target_atena_code INTEGER,
  detail            JSONB NOT NULL,
  ip                TEXT,
  user_agent        TEXT
);
CREATE INDEX IF NOT EXISTS audit_log_at_idx ON audit_log(at);
CREATE INDEX IF NOT EXISTS audit_log_actor_login_idx ON audit_log(actor_login);
CREATE INDEX IF NOT EXISTS audit_log_target_atena_code_idx ON audit_log(target_atena_code);

-- 日次ダイジェスト（改ざん検知用）
CREATE TABLE IF NOT EXISTS daily_digests (
  id              SERIAL PRIMARY KEY,
  date            DATE NOT NULL UNIQUE,
  digest          TEXT NOT NULL,
  previous_digest TEXT,
  row_count       INTEGER NOT NULL,
  computed_at     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
