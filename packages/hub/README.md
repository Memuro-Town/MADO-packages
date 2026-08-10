# MADO-Hub

住民基本台帳データの検索・出力 Web アプリです。PostgreSQL に格納された住民データに接続し、氏名・フリガナ・生年月日・宛名番号での検索、Excel への直接貼り付けまたは CSV 出力ができます。ID＋パスワード認証と、閲覧できる項目を人ごとに制御する権限管理、監査ログを備えています。

---

## hub の位置づけ

hub は、`form`・`care`・`move` など MADO の他パッケージにおいて、住民情報を検索・活用する機能を提供する**共通コンポーネント**です。

- `form`・`care`・`move` は、転入・婚姻・おくやみ等の**ライフイベントに伴う窓口手続きを起点**とするシステムです
- 一方 hub 自体は特定の手続きに紐づかない、住民情報を活用する事務処理全般に使える**汎用型のシステム**です。個人番号利用事務系という閉じたネットワークの中で、従来は住基システムの画面から手作業でコピー＆ペーストして文書発送用の宛名・台帳・カルテ等を作成していた事務作業に活用できます

データベースのテーブルには、業務に応じて付帯情報（列）を拡張することもできます。

### 認証・権限・監査ログの運用は自治体ごとの判断が必要

**権限設定・認証・操作ログ監査の機能自体は実装済み**ですが（後述の「認証・権限管理」「監査ログ」を参照）、それらを実際にどう運用するか——権限グループの設計、監査ログの点検体制・保存期間・改ざん防止の運用方法等——は、導入する自治体ごとに検討・判断した上で導入する必要があります。

---

## 機能

- **住民検索** — 氏名、フリガナ（ひらがな可）、生年月日（和暦7桁・西暦8桁）、宛名番号で検索
- **詳細表示** — 住所・世帯主・本籍・戸籍筆頭者など15項目以上を表示
- **世帯員一覧** — 同一世帯の構成員を表示・絞り込み
- **出力フィールド選択** — 項目をチェックボックスで自由に選択
- **カスタム列** — DB の任意列をドロップダウンから追加
- **エクスポート** — クリップボード（タブ区切り、Excel 直貼り）または CSV（BOM 付き）
- **カラム名設定** — `columns.json` を差し替えるだけで異なる DB 構造に対応
- **認証・権限管理** — ID＋パスワードログイン、無操作タイムアウト、権限グループによる閲覧項目の制御（詳細は後述）
- **管理画面** — ユーザー登録・権限付与・期限運用・操作記録の閲覧（admin ロールのみ）
- **監査ログ** — 誰が・いつ・何を・誰に対して閲覧したかを記録。改ざん検知のための日次ダイジェストつき

---

## 前提条件

- **PostgreSQL** に格納された住民データ
- Docker（ローカルの PostgreSQL 起動用。推奨）または Node.js 20+
- Docker を使わず、既存の PostgreSQL にスキーマを手動適用する場合は `psql` クライアントも必要

住民データベースの用意はご自身の環境で行ってください。このリポジトリはサンプルデータ（`prisma/seed.js`）を含みますが、実データは含みません。

---

## クイックスタート

```bash
# 1. クローン
git clone https://github.com/<your-org>/mado-hub.git
cd mado-hub

# 2. 依存パッケージのインストール
npm install

# 3. 環境変数を設定
cp .env.example .env
# .env を編集: POSTGRES_PASSWORD / SESSION_SECRET はダミー値のまま運用しないこと（生成方法は .env.example のコメント参照）。
# DATABASE_URL は POSTGRES_USER/PASSWORD/DB と同じ値に揃える。

# 4. ローカル用 PostgreSQL を起動（Dockerが無い場合は自前のPostgreSQLを用意してください）
docker compose up -d --build postgres
# コンテナの初回起動時に prisma/auth_init.sql と prisma/init.sql は自動適用されるため、
# Docker を使う場合は次の手順の psql コマンドは不要です。

# 5. Prismaクライアントを生成
npx prisma generate
# Docker を使わず既存の PostgreSQL に接続する場合のみ、スキーマを手動で適用してください（要 psql）:
#   psql "$DATABASE_URL" -f prisma/auth_init.sql   # 認証・権限・監査ログ用テーブル
#   psql "$DATABASE_URL" -f prisma/init.sql        # 住民テーブル（本番では実データに接続するため通常は不要）

# 6. （任意）ダミーの住民データを投入
npm run seed

# 7. 最初の管理者アカウントを作成
node scripts/create-user.mjs <ログインID> <氏名> <部署> admin

# 8. 開発サーバー起動（ポート 3010）
npm run dev
```

ブラウザで http://localhost:3010 を開き、手順7で作成したアカウントでログインすると使用できます。

### DB を更新するには

住民データベースは `columns.json`（後述）でカラム名をマッピングして参照します。実データの投入・更新は既存の PostgreSQL 運用（`psql`、レプリケーション等）に従ってください。ダミーデータの再投入は `npm run seed` で行えます。

---

## 認証・権限管理

### ログイン

ID＋パスワードでログインします（`app/login/page.tsx`）。パスワードは bcrypt でハッシュ化して保存します。

- **無操作タイムアウト**：最終操作から10分でセッションが失効します。操作のたびにトークンが再発行され延長されます（`proxy.ts` によるスライディング延長方式）
- **絶対タイムアウト**：最初のログインから12時間で、操作を続けていても必ず失効します

### 職員アカウントの管理

アカウントの登録・無効化・パスワードリセットは、**管理画面（`/admin/users`。後述）から行えます。**

サーバー上の CLI からも同じ操作ができます（初期管理者の作成時や、画面が使えない場合の復旧手段として利用）：

```bash
node scripts/create-user.mjs <ログインID> <氏名> <部署> [admin|staff]
node scripts/disable-user.mjs <ログインID>
```

- `role` 省略時は `staff`。パスワードは実行後にプロンプトで2回入力する（画面にエコーされない・8文字以上）
- 無効化はレコードを削除せず `is_active` を `false` にする

### 権限グループ

閲覧できる項目（DBの列）は「権限グループ」単位で制御します（`lib/permissionGroups.ts`）。

- グループの中身（どの列を含むか）は**コードに固定**し、管理画面からは編集できません。グループの変更は全員の権限に影響する重い操作のため、コード変更としてレビュー・決裁のフローを必ず通す設計です
- 各ユーザーへの権限は「グループの割り当て（期限つき）」＋「臨時の個別項目の追加・除外（理由必須・期限つき）」の組み合わせで決まります
- 権限には**必ず期限があります**（既定は年度末）。期限切れは自動的に無効になり、管理画面から一括延長できます
- 権限はリクエストごとに DB から解決します（JWT に埋め込みません）。これにより権限を取り消すと即座に反映されます

---

## 管理画面

`role: "admin"` のユーザーは `/admin` 配下の管理画面を利用できます（`proxy.ts` で admin ロール以外はアクセス不可）。

| パス | 内容 |
|---|---|
| `/admin/users` | ユーザー一覧・新規登録 |
| `/admin/users/[id]` | 権限詳細・編集・パスワードリセット・グループ付与/延長/取消・臨時の追加/除外 |
| `/admin/expirations` | 期限切れ間近／期限切れ済みの権限一覧、複数選択での一括延長 |
| `/admin/audit-log` | 管理画面の操作記録（決裁用の印刷ビュー） |
| `/admin/resident-log` | 住民情報の閲覧記録と日次ダイジェストのチェーン（印刷ビュー） |

すべての書き込み操作（ユーザー登録・権限変更等）は `AdminAuditLog` テーブルに記録されます。

---

## columns.json — カラム名設定

`columns.json` は DB のカラム名をアプリが扱う論理名にマッピングします。  
**環境ごとにこのファイルだけを差し替えることで、異なる DB 構造に対応できます。**

```json
{
  "table":                  "resident_table",
  "atena_code":             "宛名番号",
  "household_code":         "世帯番号",
  "name":                   "氏名",
  "name_kana":              "氏名_フリガナ",
  "birthdate":              "生年月日",
  "address_town":           "住所_町字",
  "address_banchi":         "住所_番地号表記",
  "resident_status":        "住民状態",
  "gender":                 "性別表記",
  "household_head_name":    "世帯主氏名",
  "address_city":           "住所_市区郡町村名",
  "address_kata":           "住所_方書",
  "postal_code":            "住所_郵便番号",
  "honseki":                "本籍",
  "koseki_head_surname":    "戸籍_筆頭者_氏",
  "koseki_head_given_name": "戸籍_筆頭者_名",
  "relationship":           "続柄表記",
  "record_order":           "記載順位"
}
```

各キーの説明:

| キー | 用途 |
|---|---|
| `table` | テーブル名 |
| `atena_code` | 住民の一意識別コード（宛名番号） |
| `household_code` | 世帯の識別コード |
| `name` / `name_kana` | 氏名・フリガナ（検索対象） |
| `birthdate` | 生年月日（`YYYY-MM-DD` または `YYYY/MM/DD` 形式） |
| `address_*` | 住所の各パーツ |
| `resident_status` | 住民状態（1:現住民 2:転出 3:死亡 9:消除） |
| `gender` | 性別表記 |
| `household_head_name` | 世帯主氏名 |
| `honseki` | 本籍 |
| `koseki_head_*` | 戸籍筆頭者の姓・名 |
| `relationship` | 続柄表記 |
| `record_order` | 世帯員の並び順（昇順ソートに使用） |

設定ファイルに含まれないキーはデフォルト値（上記 JSON の値）が使われます。

### 必須カラムとオプションカラム

検索・一覧表示に必要な**必須カラム**:

| キー | 用途 |
|---|---|
| `table` | テーブル名 |
| `atena_code` | 一意識別コード（検索・詳細取得のキー） |
| `household_code` | 世帯員一覧の絞り込みキー |
| `name` / `name_kana` | 氏名・フリガナ検索 |
| `birthdate` | 生年月日検索（`YYYY-MM-DD` または `YYYY/MM/DD` 形式） |
| `resident_status` | 現住民・転出者などの状態コード |

詳細画面でのみ使う**オプションカラム**（DB にない場合は空文字になります）:  
`address_*`、`gender`、`household_head_name`、`honseki`、`koseki_head_*`

世帯員一覧に必要なカラム:  
`relationship`（続柄）、`record_order`（並び順）

> **注意:** DB にないカラムを指定すると SQL エラーになります。  
> 存在しないカラムは `columns.json` から該当キーを削除するか、ダミーのカラム名（`SELECT '' AS ...` 相当）には対応していないため、DB 側にビューやダミー列を用意してください。

### 住民状態コードについて

`resident_status` の値は以下のコードを前提として画面表示します。  
異なるコード体系の場合は [app/components/ResidentDataExport.tsx](app/components/ResidentDataExport.tsx) の `RESIDENT_STATUS` を変更してください。

| コード | 表示 |
|---|---|
| `1` | 現住民 |
| `2` | 転出者 |
| `3` | 死亡者 |
| `9` | 消除者 |

---

## ローカル開発

```bash
# 依存パッケージのインストール
npm install

# ローカル用 PostgreSQL を起動
docker compose up -d --build

# Prismaクライアントの生成
npx prisma generate

# 環境変数の設定
cp .env.example .env
# .env を編集して DATABASE_URL 等を実際の値に変更

# テスト実行
npm test

# 開発サーバー起動（ポート 3010）
npm run dev
```

http://localhost:3010 でアクセスできます。

### 環境変数

| 変数 | 説明 | デフォルト |
|---|---|---|
| `DATABASE_URL` | PostgreSQL 接続文字列（Prisma 形式: `postgresql://user:password@host:5432/dbname`） | — |
| `COLUMN_CONFIG_PATH` | `columns.json` のパス | `/data/columns.json`（ローカル開発時はプロジェクトルートの `columns.json` を指定） |
| `SESSION_SECRET` | セッション JWT 署名用の秘密鍵（32文字以上のランダムな文字列） | — |

`.env.example` に生成方法つきで記載しています。

---

## アーキテクチャ

```
app/
  page.tsx                          # エントリポイント（検索 → 選択 → 出力の流れ）
  login/page.tsx                    # ログイン画面
  admin/                            # 管理画面（admin ロールのみ）
    users/page.tsx                    # ユーザー一覧
    users/new/page.tsx                # 新規登録
    users/[id]/page.tsx               # 権限詳細・編集
    expirations/page.tsx              # 期限運用・一括延長
    audit-log/page.tsx                 # 管理操作記録（印刷ビュー）
    resident-log/page.tsx              # 住民情報閲覧記録・日次ダイジェスト（印刷ビュー）
  components/
    ResidentSearch.tsx                # 検索UIと入力パース
    ResidentList.tsx                  # 検索結果リスト
    ResidentDataExport.tsx            # 詳細表示・フィールド選択・エクスポート
    StatusBadge.tsx                   # 住民状態バッジ
    UserBadge.tsx                     # ログイン中ユーザー表示・ログアウト
  api/
    auth/login|logout|me/             # 認証
    residents/search/                 # 検索エンドポイント（最大50件）
    residents/[id]/                   # 住民詳細（権限フィルタあり）
    residents/[id]/extras/            # カスタム列取得（information_schemaでホワイトリスト検証）
    residents/columns/                # 権限内で選択可能なDB列名一覧
    households/[id]/                  # 世帯員一覧（権限フィルタあり）
    admin/users/                      # ユーザーCRUD・権限グループ付与・臨時例外
    admin/expirations/                # 期限一覧・一括延長
    admin/audit-log/                  # 管理操作記録
    admin/resident-log/               # 住民情報閲覧記録
    admin/daily-digests/              # 日次ダイジェストのチェーン
proxy.ts                            # 認証ゲート（旧middleware.ts）。無操作タイムアウトの延長もここで行う
lib/
  db.ts                             # Prismaクライアント（シングルトン）
  columns.ts                        # columns.json 読み込みと q() ヘルパー
  columnDependencies.ts             # 出力項目→必要DB列の対応表（連結項目の権限判定用）
  date.ts                           # 和暦変換・生年月日パース・年齢計算
  session.ts                        # セッションJWTの発行・検証（無操作・絶対タイムアウト）
  authFetch.ts                      # 401検知→ログイン画面誘導を一元化するfetchラッパー
  safeRedirect.ts                   # オープンリダイレクト対策
  permissionGroups.ts               # 権限グループ定義（コード管理）
  permissions.ts                    # 実効的な閲覧可能列の計算
  grantActions.ts                   # 権限グループ付与の延長ロジック（個人画面・一括継続で共用）
  fiscalYear.ts                     # 年度末（既定の権限期限）計算
  userAccount.ts                    # ユーザー作成のバリデーション定数
  adminAuth.ts                      # 管理画面のadmin判定
  adminAudit.ts                     # 管理画面の操作記録（AdminAuditLog）
  auditLog.ts                       # 住民情報閲覧記録（audit_log）
  auditDigest.ts                    # 日次ダイジェスト計算（改ざん検知）
scripts/
  create-user.mjs                   # ユーザー作成CLI（初期管理者作成・復旧用）
  disable-user.mjs                  # ユーザー無効化CLI
  migrate-grants.mjs                # 既存ユーザーへの権限移行スクリプト
  compute-daily-digest.mjs          # 日次ダイジェスト計算バッチ
prisma/
  schema.prisma                     # 全テーブル定義
  auth_init.sql                     # 認証・権限・監査ログ用テーブルのSQL（schema.prismaと完全一致させること）
  init.sql / dev_init.sql           # 住民テーブル（ダミーデータ用）
docker-compose.yml                 # ローカル開発用 PostgreSQL（pgAudit有効化済み）
Dockerfile.postgres                # pgAudit入りのPostgresイメージ
```

### 検索入力の自動判定ロジック

| 入力 | 判定 | 例 |
|---|---|---|
| 文字列 | 氏名・フリガナ検索 | `山田`、`やまだ`、`ヤマダ` |
| 7桁数字かつ 8,000,000 未満 | 和暦生年月日 | `4050101` → 平成5年1月1日 |
| 8桁数字かつ 1900〜2039 | 西暦生年月日 | `19930101` |
| その他の数字 | 宛名番号 | `1234567` |

### カラム名差し替えの仕組み

すべての SQL クエリは `lib/columns.ts` が提供する変数を使って組み立てます。レスポンスには固定エイリアスを付与するため、DB のカラム名がどのような名前であっても、フロントエンドが受け取るキー名は常に一定です。

```
columns.json → lib/columns.ts → API route（SQLクエリ組み立て）→ 権限フィルタ → 固定エイリアス付きレスポンス → フロントエンド
```

---

## 監査ログ

住民情報の閲覧・検索を記録する監査ログ機能を備えています。

### 記録される内容

- **誰が**（ログインID・氏名・部署）・**いつ**・**何を**（検索／住民詳細閲覧／カスタム列閲覧／世帯閲覧）・**誰に対して**（宛名番号）を `audit_log` テーブルに記録します
- 記録は権限フィルタ後に何も見えていない場合（該当データが無い等）には残しません
- 管理画面の操作（ユーザー登録・権限変更・パスワードリセット等）は別テーブル（`admin_audit_log`）に記録します。住民データの閲覧記録とは性質・点検頻度・閲覧者が異なるため、意図的にテーブルを分けています

### 日次ダイジェスト（改ざん検知）

「前日のダイジェスト＋その日の全記録」をハッシュ化して数珠つなぎにする方式で、`audit_log` が後から書き換えられていないかを検証できます（`lib/auditDigest.ts`）。

```bash
# 対象日（省略時は前日）の分を計算する。夜間バッチとして1日1回実行する想定
node scripts/compute-daily-digest.mjs [YYYY-MM-DD]
```

- **冪等**：既に計算済みの日を指定した場合、再計算結果が一致すれば何もしません
- **改ざん検知**：再計算結果が保存済みの値と食い違う場合は警告を出して**上書きしません**（`audit_log` の過去データが変更された可能性がある、という意味）
- **チェーンの欠け検知**：前日分のダイジェストが無いのに、それより前のデータが存在する場合はエラーで停止します

> ⚠️ このスクリプトは「その日の記録が確定してから、1日1回だけ」実行する前提です。同じ日に2回以上（間に新しい記録が増えた状態で）実行すると、2回目以降は改ざんと区別できず弾かれます。

管理画面（`/admin/resident-log`、admin ロールのみ）で、ダイジェストのチェーンと閲覧記録を期間指定で確認・印刷できます。ダイジェストの値は、改ざん耐性を持たせるため運用者の手の届かない場所（決裁フロー・別部署等）に定期的に固定（アンカー）する運用と組み合わせて初めて意味を持ちます。

### pgAudit（任意・DB層での補完）

`audit_log` は hub のアプリコードを経由した記録のため、`psql` 等で DB を直接操作された場合は捕捉できません。これを補うため、PostgreSQL 拡張の [pgAudit](https://github.com/pgaudit/pgaudit) を任意で導入できます。SQL 単位でのアクセスを、hub のアプリコードを一切経由せずに記録します。

ローカル開発環境では `Dockerfile.postgres`（`postgres:16` ベース、apt 経由で `postgresql-16-pgaudit` を導入）で有効化済みです。`docker compose up -d --build` で自動的にビルドされます。本番（ネイティブインストール構成）への導入・検証手順は整備中です。

---

## Contributing

バグ報告・機能提案は [Issues](../../issues) へどうぞ。

Pull Request を送る場合:

1. このリポジトリを Fork する
2. ブランチを作成: `git checkout -b feature/your-feature`
3. 変更をコミット
4. PR を作成

### 開発上の注意

- SQL の列名はすべて `q()` でダブルクォートしてください（インジェクション防止）
- カスタム列（extras API）は `information_schema.columns` でホワイトリスト検証しています
- `columns.json` に存在しないキーは `lib/columns.ts` のデフォルト値にフォールバックします
- `lib/date.ts` の和暦変換は元号の境界日（例: 平成は1989年1月8日〜）を考慮しています
- 権限グループの中身（`lib/permissionGroups.ts`）は管理画面から編集できない設計です。変更する場合は必ずコードレビューを通してください
- 複数DB列を連結して1つの出力項目にしている箇所（例: 本籍住所＋番地、戸籍筆頭者）は `lib/columnDependencies.ts` に「出力項目→必要な全DB列」を対応づけて権限判定しています。新しい連結項目を追加する場合はここも更新してください
- `prisma/schema.prisma` と `prisma/auth_init.sql` は常に同時に更新してください（オフライン環境へは `auth_init.sql` を `psql -f` で適用するため）

---

## ライセンス

[MIT](./LICENSE)
