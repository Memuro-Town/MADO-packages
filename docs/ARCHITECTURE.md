# システム設計書（hub）

`packages/hub` の技術構成をまとめる。実装（`app/` `lib/` `proxy.ts` `prisma/`）と対応させて記述している。

---

## 技術スタック

| 区分 | 採用技術 |
|---|---|
| フレームワーク | Next.js 16（App Router） |
| 言語 | TypeScript 5 / React 19 |
| データベース | PostgreSQL 16 |
| ORM | Prisma 5（住民データへのクエリは `$queryRawUnsafe`） |
| 認証 | `jose`（JWT / HS256）＋ `bcryptjs`（パスワードハッシュ） |
| スタイル | Tailwind CSS v4 |
| テスト | vitest |
| 実行環境 | Node.js 20 / Docker（`node:20-alpine`） |
| ポート | 3010 |

Next.js 16 では従来の `middleware.ts` が非推奨となり **`proxy.ts`** に置き換わっている。認証ゲートはこのファイルにある。

### 依存ライブラリの選定理由

- **`bcryptjs` / `jose`** — どちらも純JavaScript実装。ネイティブビルドやOS依存パッケージを必要としないため、外部ネットワークに接続できない環境でも `node_modules` を持ち込むだけで動く。`bcrypt`（ネイティブ実装）や `argon2` を避けたのはこの理由による。
- **Prisma** — 住民テーブルのカラム名が日本語かつ自治体ごとに異なるため、スキーマを固定できない。Prismaのモデル定義は認証用 `users` テーブルと住民テーブルの最小限のキーだけにとどめ、住民データの取得は生SQL（`$queryRawUnsafe`）で行っている。

### SQLite から PostgreSQL への移行

`hub` は当初 SQLite ファイルを直接読む構成だった。以下の理由で PostgreSQL に移行している。

- `form` / `care` / `move` が同じ住民データを参照するため、複数プロセスからの同時接続が前提になった
- 住民基本台帳の全項目（100列超）を保持すると、SQLiteファイルの受け渡し運用では更新のたびに全体を差し替える必要があった
- 日本語カラム名・照合順序・型の扱いを、汎用的なRDBMSの挙動に合わせておきたかった

移行に伴い、SQLite固有だった実装（`PRAGMA table_info` によるカラム検証など）は PostgreSQL の `information_schema.columns` を使う形に置き換えている。

---

## ディレクトリ構成

```
packages/hub/
  proxy.ts                        # 全経路の認証ゲート（旧 middleware.ts）
  columns.json                    # DBカラム名 → 論理名のマッピング
  app/
    page.tsx                      # メイン画面（検索 → 選択 → 出力）
    login/page.tsx                # ログイン画面
    components/
      ResidentSearch.tsx            # 検索UI
      ResidentList.tsx              # 検索結果リスト
      ResidentDataExport.tsx        # 詳細表示・項目選択・出力
      StatusBadge.tsx               # 住民状態バッジ
      UserBadge.tsx                 # ログイン中の職員名・ログアウト
    api/
      auth/login|logout|me/         # 認証
      residents/search/             # 検索（最大50件）
      residents/[id]/               # 住民詳細
      residents/[id]/extras/        # カスタム列の値取得
      residents/columns/            # 選択可能なカラム名一覧
      households/[id]/              # 世帯員一覧
    admin/                         # 管理画面（admin ロールのみ。proxy.tsでガード）
      users/                         # ユーザー一覧・新規登録・詳細編集
      expirations/                   # 権限の期限一覧・一括延長
      audit-log/                     # 管理画面の操作記録（印刷ビュー）
      resident-log/                  # 住民情報の閲覧記録・日次ダイジェスト（印刷ビュー）
    api/admin/                    # 管理画面向けAPI（users/expirations/audit-log等）
  lib/
    session.ts                    # JWTの生成・検証（10分無操作 + 12時間絶対タイムアウト）
    permissions.ts                # 実効的な閲覧可能列の計算（グループ+例外）
    permissionGroups.ts           # 権限グループ定義（コード管理。管理画面から編集不可）
    grantActions.ts               # 権限グループ付与の延長ロジック
    fiscalYear.ts                 # 年度末を期限の既定値として計算
    auditLog.ts                   # 住民情報の閲覧・検索の監査ログ（audit_log）
    auditDigest.ts                # 改ざん検知用の日次ダイジェスト計算
    adminAuth.ts                  # 管理画面のadmin判定
    adminAudit.ts                 # 管理画面の操作記録（admin_audit_log）
    authFetch.ts                  # 認証つきfetchのラッパー
    userAccount.ts                # ユーザーCRUDの共通ロジック
    columnDependencies.ts         # 列同士の依存関係（例: 続柄コード⇔続柄表記）
    safeRedirect.ts               # オープンリダイレクト対策
    columns.ts                    # columns.json 読み込みと q() ヘルパー
    db.ts                         # Prismaクライアント（シングルトン）
    date.ts                       # 和暦変換・生年月日パース・年齢計算
    clipboard.ts                  # 非secure contextでも動くコピー処理
  scripts/
    create-user.mjs               # 職員アカウント登録CLI（初期管理者作成・復旧用）
    disable-user.mjs              # 職員アカウント無効化CLI
    migrate-grants.mjs            # 権限グループ付与の一括移行スクリプト
    compute-daily-digest.mjs      # 日次ダイジェストの計算・記録（cron等で定期実行）
  prisma/
    schema.prisma                 # users・権限グループ関連・監査ログ関連・住民テーブルの最小定義
    auth_init.sql                 # users・権限グループ・監査ログ関連テーブルのDDL
    pgaudit_init.sql              # pgAudit拡張の有効化
    init.sql / dev_init.sql       # 住民テーブルのDDL（開発用）
    seed.js / seed_additional.js  # 開発用ダミーデータ
    migrations/                   # Prisma Migrateのマイグレーション履歴
  docs/
    database-requirements.md      # 接続先DBのカラム定義メモ
    OPERATIONS.md                 # 運用手順（初回セットアップ・アカウント管理等）
  Dockerfile                      # マルチステージビルド（standalone出力）
  Dockerfile.postgres             # pgAudit拡張入りのPostgresイメージ
  docker-compose.yml              # postgres + app の2サービス
  .env.example                    # 環境変数のひな形（値はすべてダミー）
```

---

## 認証

### 全経路のゲート（`proxy.ts`）

`proxy.ts` がすべてのリクエストを受け、セッションCookieを検証する。

- 公開パスは `/login`・`/api/auth/login`・`/api/auth/logout` の3つのみ
- 検証に失敗した場合、`/api/` 配下は **401 JSON**、それ以外の画面は **`/login` へリダイレクト**（元のURLを `?from=` に付与）
- `_next/static` や画像などの静的アセットは matcher で対象外

つまり、住民データを返すAPIも画面も、未ログインでは一切到達できない。個別のAPIに認証チェックを書き忘れても穴が開かない構造にしている。

### セッション（`lib/session.ts`）

| 項目 | 値 |
|---|---|
| 方式 | JWT（HS256） |
| 署名鍵 | 環境変数 `SESSION_SECRET`（未設定・32文字未満なら最初のセッション処理で例外を投げて停止） |
| 有効期限 | 12時間 |
| Cookie名 | `mado_session` |
| Cookie属性 | `HttpOnly` / `SameSite=Lax` / `Path=/` |

JWTのペイロードには `sub`（ログインID）・`name`・`department`・`role` が入る。住民情報は入らない。

`lib/session.ts` は `proxy.ts` から読み込まれるため、**`jose` 以外に依存してはならない**（Prisma や `bcryptjs` を import するとプロキシ層で動かない）。ファイル冒頭のコメントにも明記してある。

> **既知の制約:** Cookie に `Secure` 属性を付けていない。閉じたLAN内で `http://` 配信する前提のため。TLS終端のある環境に載せる場合は `SESSION_COOKIE_OPTIONS` に `secure: true` を追加すること。

### ログイン（`app/api/auth/login/route.ts`）

- パスワードは `bcryptjs` で照合（登録時のコストは10、最低8文字）
- **ログインIDが存在しない場合もダミーハッシュに対して `bcrypt.compare` を実行する。** 応答時間の差からIDの存在有無を推測されないようにするため
- 認証失敗時は一律500msの遅延を入れ、`ログインIDまたはパスワードが違います` という区別のつかないメッセージを返す
- ログイン後のリダイレクト先は `lib/safeRedirect.ts` で検証する。`/` 始まりの相対パスのみ許可し、`//evil.example`・`/\evil.example`・`http://…`・`javascript:` などは `/` にフォールバックする

### 職員アカウント

`users` テーブル（`prisma/auth_init.sql`）。住民テーブルには一切手を加えない新設テーブル。

| カラム | 内容 |
|---|---|
| `login_id` | ログインID（一意） |
| `name` / `department` | 表示用の氏名・部署 |
| `role` | `admin` または `staff`（既定値 `staff`） |
| `password_hash` | bcryptハッシュ |
| `is_active` | 無効化フラグ |
| `created_at` | 作成日時 |

アカウントの登録・無効化はCLIで行う（画面からは操作できない）。

```bash
node scripts/create-user.mjs <ログインID> <氏名> <部署> [admin|staff]
node scripts/disable-user.mjs <ログインID>
```

無効化は `is_active` を `false` にするだけで、**行は削除しない**。誰がいつ登録されたかの記録を残すため。

---

## 権限設計の現状と限界

住民情報を扱うシステムである以上、ここは正直に書いておく。

### 現在実装されている制御

**1. 認証ゲート（`proxy.ts`）**
未ログインでは画面もAPIも一切利用できない。

**2. 権限グループによる列制御（`lib/permissions.ts` / `lib/permissionGroups.ts`）**
住民テーブルには100列以上ある（同梱のサンプルDDL `prisma/init.sql` で122列）。画面・APIから取得できる列は、ユーザーに付与された「権限グループ」が許可する列だけに絞られる。実効的な閲覧範囲は次の式で計算する（`lib/permissions.ts` の `computeAllowedColumns`）。

```
実効的な閲覧範囲 = Σ(期限内・未取消のグループ割り当てを展開した列)
                  + Σ(期限内・未取消の追加(add)例外)
                  - Σ(期限内・未取消の除外(remove)例外)
```

グループの中身（どの列を含むか）は `lib/permissionGroups.ts` に**コードとして固定**され、管理画面からは編集できない。グループの変更は全員の権限に一斉に影響する重い操作のため、コード変更としてPRレビューを通す設計になっている。権限グループの付与・臨時の例外追加・削除は `admin` ロールのユーザーが管理画面（`/admin/users/[id]`）から行い、いずれも**期限つき**（既定は年度末）で、期限切れは自動的に無効になる。

現状定義されている権限グループは「基本グループ（住民基本情報）」1種類のみ。機微な項目の扱いは以下の3段階に分かれている。

| 項目 | スキーマ・サンプルデータ | 基本グループの対象列 | 画面・APIからの参照 |
|---|---|---|---|
| `個人番号`（マイナンバー） | **持たせていない** | — | 不可（列自体が存在しない） |
| `基礎年金番号`・`在留カード等番号` | あり | 含めていない | 不可 |
| `住民票コード` | あり | **含めている**（意図的） | 可 |

- **`個人番号` は、検証用スキーマ（`prisma/init.sql` / `dev_init.sql`）にもサンプルデータにも列として持たせていない。** 値が架空の合成値であっても、法令上の取扱いが特別に厳格な項目をサンプルデータに列として置くこと自体が誤用・誤解を招くという判断による。本番の住民データベースでも、日次のCSV取込（[`tools/csv_import`](../tools/csv_import/README.md)）側で構造的に除外している。必要になる場合は、各団体の責任で法令上・運用上の要件を満たしたうえで追加すること（`packages/hub/docs/database-requirements.md` に同趣旨を記載）
- **`基礎年金番号`・`在留カード等番号` は列としては存在するが、基本グループの対象に含めていない。** DBに値があっても画面・APIからは参照できない
- **`住民票コード` は基本グループに含めている。意図的な設定であり、見落としではない**（2026-07-28 確認済み）。住民の特定・照合に使う実務上の必要から現状のまま含める。導入自治体は自庁のポリシーに照らして要否を判断すること

**3. 二重の検証（`app/api/residents/[id]/extras/route.ts`）**
カスタム列の取得APIは、リクエストされた列名を
(a) `information_schema.columns` に実在するか、
(b) 権限グループが許可する列に含まれるか
の両方で検証し、両方を満たす列だけを SELECT する。列名は `"` をエスケープしたうえでダブルクォートで囲む。SQLインジェクション対策と権限制御を独立した2段で持たせている。

**4. 監査ログ**
住民情報の閲覧・検索と、管理画面での操作を、性質の異なる別々のテーブルに記録する。

- **住民情報の閲覧・検索**（`lib/auditLog.ts` / `audit_log` テーブル）— 検索（`resident.search`）、住民詳細の閲覧（`resident.view`）、カスタム列の値取得（`resident.view_extra`）、世帯員一覧の閲覧（`household.view`）を、職員のログインID・氏名・部署、対象の宛名番号（検索時は `null`）、検索クエリ・件数・取得した列名などの詳細（JSONB）、発信元IP、User-Agent、日時とともに記録する
- **管理画面の操作**（`lib/adminAudit.ts` / `admin_audit_log` テーブル）— ユーザー登録・パスワードリセット・権限グループの付与や取消・臨時例外の追加や削除などを記録する
- **改ざん検知用の日次ダイジェスト**（`daily_digests` テーブル）— その日の `audit_log` 全行を正規化して直列化し、前日のダイジェストと連結してハッシュ化する。ダイジェストの値自体は運用者の手の届かない場所（決裁フロー・別部署等）に定期的に固定する運用と組み合わせて初めて意味を持つ
- **pgAudit拡張**（`prisma/pgaudit_init.sql`）— アプリ層のログとは独立に、PostgreSQL自体が発行された全SQLを記録する。アプリ側のログ漏れ・改ざんに対する保険として機能する

テーブル定義は `prisma/auth_init.sql`（`users`・権限グループ関連・監査ログ関連をまとめて定義）。**この仕組みは開発・サンプル環境での初回起動時（`docker-entrypoint-initdb.d`）にしか自動適用されない。** 既に稼働しているDBには `psql -f prisma/auth_init.sql` を手動で流して適用する必要がある。監査ログの書き込み失敗は本来の閲覧処理を止めないため、未適用のまま運用すると記録がされないままエラーにも気づけない点に注意する。

**`audit_log` テーブル自体が個人情報を含む。** `detail` に検索クエリ（住民の氏名等）が平文で入るため。アクセス制御・保持期間・削除やアーカイブの運用は導入自治体が定める必要がある。

### 限界（現時点で解決できていないこと）

- **部署・業務単位であらかじめ分かれた権限グループが定義されていない。** 期限つきの個人単位での権限付与・例外設定はできるが、現状定義されている権限グループは「基本グループ」1種類のみで、「この部署はこの住民のこの項目まで」という単位での作り分けは各自治体側の設計・実装に委ねられている
- **出力操作は監査ログに残らない。** クリップボードへのコピー・CSV保存はブラウザ側で完結しサーバにリクエストが来ないため、現在の実装では記録できない
- **アクセス制御は列単位のみで、行単位の制限がない。** 権限グループは「どの項目を見せるか」を制御するが、「どの住民を見せないか」は制御できない。DV等支援措置の対象者のように、特定の住民への参照そのものを制限すべきケースは、現在の実装では運用と事後の監査で担保するほかない。導入時に必ず検討すること

導入自治体の業務実態に合わせた権限グループの設計は、コード変更（PRレビュー）を通す必要がある領域であり、**ここは設計から相談したい部分なので、Issue での議論を歓迎する。**

---

## データベース

### 住民テーブル

- カラム名は**日本語**。自治体の住民基本台帳システムからの出力仕様に依存する
- カラム構成は自治体ごとに異なるため、Prismaのモデルには検索・世帯絞り込みに必須のキーだけを定義し、実際のクエリは生SQLで組み立てる
- 開発用のDDL（`prisma/init.sql` / `prisma/dev_init.sql`）は芽室町で使っている出力仕様に沿った列構成のサンプル。他自治体では自前のDDLに差し替える。`docker compose` が初期化に使うのは `init.sql` のほう

必要なカラムの詳細は [REQUIREMENTS.md](REQUIREMENTS.md) を参照。

構造上は、`宛名番号` を鍵にして**別テーブル**を追加し、他業務システムの情報（例: 保険資格情報、税の賦課情報）を `hub` から参照させる設計も可能ではある。ただし現状の `hub` はそうした実装をしておらず、閲覧範囲は住基の照会画面で見える項目にとどめている。内部検討では拡張の可能性が議論されているが未実施であり、他自治体で導入する場合も、`宛名番号` を鍵にした他システムとの情報連携をどこまで行うかは自庁のポリシーに照らして個別に検討が必要。

### 本番環境での住民データの更新

芽室町では、住基システムが出力するCSVを [`tools/csv_import/resident_data_to_db_pg.py`](../tools/csv_import/README.md) が日次で取り込み、`resident_table` を洗い替えている（既存テーブルを `DROP` して、その日のCSVの列構成でテーブルを作り直す方式）。`hub` アプリ本体からは独立したPythonスクリプトで、`hub` を経由せず直接PostgreSQLに書き込む。

**この洗い替え方式のため、`resident_table` の実際の列構成は `prisma/init.sql`・`prisma/dev_init.sql` ではなく、日々のCSVの中身で決まる。** これらのDDLファイルはローカル開発・サンプル環境の初期化にのみ使われ、本番のテーブル構成には影響しない。個人番号（マイナンバー）のような含めるべきでない列がCSV側に存在する場合、DDLから列を除いても防げないため、`resident_data_to_db_pg.py` 側で明示的に除外している（同スクリプトの `EXCLUDED_COLUMNS` を参照）。

他自治体で同様の運用をする場合、[`tools/csv_import/README.md`](../tools/csv_import/README.md) を参照した上で、自庁のCSV出力仕様に合わせてこのスクリプトを調整すること。

### サンプルDDLの既知の不一致 — 未解決（要確認 2026-07-29）

同梱のDDLと他の定義との間に、以下の不一致がある。事実のみ記す。原因・修正方針の判断はまだ行っていない。**トラッキング: [Issue](../../issues) を参照（`known-issue` ラベル）。**

**1. 型の不一致（11カラム）**

- `prisma/init.sql` と `prisma/dev_init.sql` で、11のカラムの型が一致していない（`市区町村コード`・`世帯番号`・`住民票コード`・`住所_町字コード`・`記載順位` など。前者は TEXT、後者は INTEGER / BIGINT）
- `prisma/schema.prisma` の `resident_table` モデルは `household_code` を `Int?` としているが、`prisma/init.sql` の `世帯番号` は TEXT である
- `docker compose` が初期化に使うのは `init.sql` のほう。`dev_init.sql` に切り替えた際に踏む

**2. 権限グループの対象列と DDL の不一致（19カラム・未再確認）**

この不一致は元々 `lib/columnAccess.ts` の許可リストに対して確認したもの。権限グループへの移行で対象列は `lib/permissionGroups.ts` の `RESIDENT_BASIC_COLUMNS` に引き継がれたが、コード中のコメントに「旧`columnAccess.ts`の`DEFAULT_ALLOWED_COLUMNS`と同一内容」とある通り、列名リスト自体は変更されていないため、同じ不一致がそのまま残っていると考えられる。**移行後の再確認はまだ行っていない。**

69件のうち19件が、`prisma/init.sql` / `dev_init.sql`（いずれも同じ122列）のどちらにも存在しない。対象列に載っていても実際には取得されない。プログラムで突き合わせて確認した内訳は次の3種類。

- **列名の表記ゆれ（4件）。列自体は別名で存在する**
  - `続柄コード` ↔ DDLは `続柄コード1`
  - `住所_地番号表記` ↔ DDLは `住所_番地号表記`
  - `本籍_地番または、街区符号` ↔ DDLは `本籍_地番号または、街区符号`（`columns.json` の `honseki_banchi` が指す、本籍表示に使う列）
  - `転出年月日` ↔ DDLは `転出年月日（確定）`
- **「予定」系の列がDDLに無い（4件）。DDLには「確定」系（`転出先住所（確定）_*`）しかない**
  - `転出先住所（予定）_町字` / `_番地号表記` / `_方書` / `_郵便番号`
- **DDLに同名・類似名の列が見つからない（11件）**
  - `氏名_外国人感じ`（DDLには `氏名_外国人ローマ字` のみ）
  - `旧氏` / `旧氏_フリガナ` / `旧氏_フリガナ確認状況`
  - `通称` / `通称_フリガナ` / `通称_フリガナ確認状況`
  - `転入前住所_方書` / `転入前住所_世帯主氏名`
  - `本籍_都道府県` / `本籍_市区郡町村名`

いずれも実装側の対応が必要な事項として認識しており、Issue での指摘・議論を歓迎する。自庁のDDLを用意する際は、[REQUIREMENTS.md](REQUIREMENTS.md#5-住民データベースの要件) の型の注意を優先すること。

### カラム名の差し替え（`columns.json`）

すべてのSQLは `lib/columns.ts` が読み込んだマッピングを使って組み立てる。レスポンスには**固定のエイリアス**を付けるため、DBの列名が何であってもフロントエンドが受け取るキー名は常に同じになる。

```
columns.json → lib/columns.ts → API route（SQL組み立て）→ 固定エイリアス付きレスポンス → フロントエンド
```

列名は必ず `q()` を通す。`q()` はダブルクォート内の `"` を `""` にエスケープしたうえで全体をダブルクォートで囲む。

設定ファイルの各キーの意味と必須／任意の区別は [packages/hub/README.md](../packages/hub/README.md) にまとめてある。

### 認証テーブル

`users` のみ。既存の住民テーブルとは独立していて、外部キーも張っていない。住民データの更新（洗い替え）で認証情報が壊れないようにするため。

---

## API

すべて `GET`（認証系を除く）。`proxy.ts` の認証を通過しないと呼べない。

| メソッド・パス | 説明 |
|---|---|
| `POST /api/auth/login` | ログイン。成功時にセッションCookieを設定 |
| `POST /api/auth/logout` | ログアウト。Cookieを即時失効（204） |
| `GET /api/auth/me` | ログイン中の職員情報（氏名・部署・role） |
| `GET /api/residents/search?q=` | 住民検索。**最大50件** |
| `GET /api/residents/{宛名番号}` | 住民詳細。固定エイリアスで返す |
| `GET /api/residents/{宛名番号}/extras?cols=A,B` | カスタム列の値。許可リストで絞り込み |
| `GET /api/residents/columns` | 選択可能なカラム名一覧（許可リスト適用済み） |
| `GET /api/households/{世帯番号}` | 世帯員一覧。`記載順位` 昇順 |

### 検索入力の自動判定（`lib/date.ts`）

入力欄は1つだけ。入力内容から検索方法を判定する。

| 入力 | 判定 | 例 |
|---|---|---|
| 数字以外を含む | 氏名・フリガナ検索 | `山田`・`やまだ`・`ヤマダ` |
| 7桁数字かつ 8,000,000 未満 | 和暦生年月日 | `4050101` → 平成5年1月1日 |
| 8桁数字かつ 19000101〜20399999 | 西暦生年月日 | `19930101` |
| その他の数字 | 宛名番号 | `1234567` |

- 和暦の先頭1桁は元号コード（1:明治 2:大正 3:昭和 4:平成 5:令和）
- 氏名検索はひらがな入力をカタカナに変換して両方を照合し、姓名間の半角・全角スペースを無視する
- 生年月日は `YYYY-MM-DD` と `YYYY/MM/DD` の両方の格納形式に対応する
- 表示用の和暦変換は元号の境界日（令和 2019-05-01、平成 1989-01-08、昭和 1926-12-25、大正 1912-07-30）で判定する

---

## 出力（`ResidentDataExport.tsx`）

- 項目は「基本情報 / 住所 / 世帯 / 本籍・戸籍 / 識別コード」のグループに分かれ、グループ単位でも個別でも選択できる。初期状態は氏名・郵便番号・住所の3つ
- 世帯員は出力に含めるかどうかと、含める人を個別に選べる。生年月日・年齢は任意で付加する
- 出力形式はクリップボード（タブ区切り）とCSV（BOM付きUTF-8、ファイル名 `住民情報_<宛名番号>.csv`）
- **列名を含めるチェックは、1回出力すると自動でオフになる。** Excelの同じ表に2件目・3件目を続けて貼るとき、列名が混ざらないようにするため
- 住民状態は `1:現住民 2:転出者 3:死亡者 9:消除者` を前提に表示する。転出・死亡・消除は検索結果に警告バッジを出す

### クリップボードの非secure context対応（`lib/clipboard.ts`）

`navigator.clipboard` は secure context（`https://` または `localhost`）でしか使えない。本番は閉じたLAN上の `http://<サーバ>:3010` で配信するため、サーバ機以外のブラウザでは `navigator.clipboard` が `undefined` になる。この場合は `document.execCommand('copy')` にフォールバックする。

---

## ネットワーク上の想定

- **閉じた庁内ネットワークで動かすことを前提にしている。** インターネットに公開する設計にはなっていない
- 芽室町では、いわゆる三層分離のうち**個人番号利用事務系**（マイナンバー利用事務系）に設置している。LGWAN接続系でもインターネット接続系でもない。住民基本台帳のデータを扱う以上、どの層に置くかは各団体の情報セキュリティポリシーに照らして判断すること
- `npm run dev` / `npm start` は `-H 0.0.0.0` で待ち受ける。庁内の他端末からブラウザで使うための意図的な設定だが、**起動したPCが属するLAN全体に公開される**ことを理解して運用すること
- `docker-compose.yml` も同じ方針で、アプリ（`app`）は 3010 番を全インターフェースに公開する一方、PostgreSQL（`postgres`）はホストのループバック（`127.0.0.1:5432`）にのみ束ねてLANに晒さない
- 外部CDNへの依存を作らないこと（`next/font/google` などは使用禁止）。オフライン環境でビルド・実行できる状態を保つ

---

## テスト

vitest を使用する（`npm test` → `vitest run`）。現在テストがあるのは `lib/` の8ファイル。

| ファイル | 対象 |
|---|---|
| `lib/session.test.ts` | JWTの生成・検証、無操作/絶対タイムアウト、`SESSION_SECRET` 未設定時のエラー |
| `lib/safeRedirect.test.ts` | オープンリダイレクト対策の各パターン |
| `lib/permissions.test.ts` | 実効的な閲覧可能列の計算（グループ+例外の合成） |
| `lib/permissionGroups.test.ts` | 権限グループの列展開、`basedOn` の循環参照検出 |
| `lib/fiscalYear.test.ts` | 年度末を期限の既定値として計算するロジック |
| `lib/auditDigest.test.ts` | 日次ダイジェストのハッシュ連結・改ざん検知ロジック |
| `lib/authFetch.test.ts` | 認証つきfetchラッパーの挙動 |
| `lib/columnDependencies.test.ts` | 列同士の依存関係の解決 |

APIルートとコンポーネントのテストは未整備。**ここは特に貢献を歓迎する。**
