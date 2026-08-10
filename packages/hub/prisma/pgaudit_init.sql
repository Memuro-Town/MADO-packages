-- pgAudit拡張の有効化。
-- shared_preload_libraries=pgaudit の設定（postgresql.confまたは起動時の-cオプション）と
-- セットで必要。docker-compose.yml側のcommand:で-cオプションを渡している。
CREATE EXTENSION IF NOT EXISTS pgaudit;
