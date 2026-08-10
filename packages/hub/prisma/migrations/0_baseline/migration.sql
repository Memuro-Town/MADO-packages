-- ベースラインマイグレーション。
--
-- 【重要】このファイルは実行しない。`npx prisma migrate resolve --applied 0_baseline`
-- で「適用済み」として記録するためだけに使う。開発・本番いずれの環境でも、対象の
-- テーブル群は既に prisma/auth_init.sql・prisma/pgaudit_init.sql（Docker初回起動時に
-- docker-entrypoint-initdb.d 経由で自動適用、または psql -f での手動適用）によって
-- 作成済みのはずである。このファイルをそのまま流すと二重作成でエラーになる。
--
-- resident_table について: ここに含まれる定義は schema.prisma の最小定義（6列）であり、
-- 実際のDDL（122列）ではない。実データベースの resident_table は
-- prisma/init.sql・prisma/dev_init.sql で別途作成・管理しており、Prisma Migrate の
-- 管理対象ではない。自治体ごとに列構成が異なるため、意図的にPrismaの外に置いている。
-- 以降このモデル定義を変更しても新しいマイグレーションは作らないこと
--（変更する場合は init.sql 側と手動で揃える）。
--
-- 今後のマイグレーションは、users・permission_grants・permission_exceptions・
-- admin_audit_log・audit_log・daily_digests（MADOが新設したテーブル）のみを対象とする。

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "login_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'staff',
    "password_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_grants" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "group_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_by" TEXT NOT NULL,
    "reason" TEXT,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "permission_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_exceptions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "effect" TEXT NOT NULL,
    "table_name" TEXT NOT NULL,
    "column_name" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_by" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "permission_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_log" (
    "id" SERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_login" TEXT NOT NULL,
    "actor_name" TEXT NOT NULL,
    "actor_dept" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_login" TEXT,
    "detail" JSONB NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" SERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_login" TEXT NOT NULL,
    "actor_name" TEXT NOT NULL,
    "actor_dept" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_atena_code" INTEGER,
    "detail" JSONB NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_digests" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "digest" TEXT NOT NULL,
    "previous_digest" TEXT,
    "row_count" INTEGER NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_digests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resident_table" (
    "宛名番号" INTEGER NOT NULL,
    "世帯番号" INTEGER,
    "氏名" TEXT,
    "氏名_フリガナ" TEXT,
    "生年月日" TEXT,
    "住民状態" INTEGER,

    CONSTRAINT "resident_table_pkey" PRIMARY KEY ("宛名番号")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_login_id_key" ON "users"("login_id");

-- CreateIndex
CREATE INDEX "permission_grants_user_id_idx" ON "permission_grants"("user_id");

-- CreateIndex
CREATE INDEX "permission_grants_group_id_idx" ON "permission_grants"("group_id");

-- CreateIndex
CREATE INDEX "permission_grants_expires_at_idx" ON "permission_grants"("expires_at");

-- CreateIndex
CREATE INDEX "permission_exceptions_user_id_idx" ON "permission_exceptions"("user_id");

-- CreateIndex
CREATE INDEX "permission_exceptions_expires_at_idx" ON "permission_exceptions"("expires_at");

-- CreateIndex
CREATE INDEX "admin_audit_log_at_idx" ON "admin_audit_log"("at");

-- CreateIndex
CREATE INDEX "admin_audit_log_actor_login_idx" ON "admin_audit_log"("actor_login");

-- CreateIndex
CREATE INDEX "admin_audit_log_target_login_idx" ON "admin_audit_log"("target_login");

-- CreateIndex
CREATE INDEX "audit_log_at_idx" ON "audit_log"("at");

-- CreateIndex
CREATE INDEX "audit_log_actor_login_idx" ON "audit_log"("actor_login");

-- CreateIndex
CREATE INDEX "audit_log_target_atena_code_idx" ON "audit_log"("target_atena_code");

-- CreateIndex
CREATE UNIQUE INDEX "daily_digests_date_key" ON "daily_digests"("date");

-- AddForeignKey
ALTER TABLE "permission_grants" ADD CONSTRAINT "permission_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_exceptions" ADD CONSTRAINT "permission_exceptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

