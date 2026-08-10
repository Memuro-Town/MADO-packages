# 開発・環境構築ガイド（hub）

`packages/hub` をローカルで動かし、テストを走らせるまでの手順。

---

## 前提

| 必要なもの | 備考 |
|---|---|
| Node.js 20 以上 | Dockerイメージも `node:20-alpine` |
| PostgreSQL 16 | 開発用は同梱の `docker-compose.yml` で起動できる |
| Docker（任意） | 開発用DBの起動に使う |

**このリポジトリは実在の住民データを含まない。** 開発用のダミーデータ生成スクリプトと、外部レビュー用の完全架空データセット（[`sample-data/`](../sample-data/README.md)）は同梱している（後述）。

---

## セットアップ

以下はすべて `packages/hub` ディレクトリで実行する。

### 1. 環境変数

**他のどの手順よりも先に行う。** `docker-compose.yml` は `POSTGRES_PASSWORD` と `SESSION_SECRET` を必須にしているため、`.env` がないと `docker compose` が起動時に失敗する。

```bash
cp .env.example .env
```

`.env` を編集する。**読み込まれるのは `.env` であって `.env.local` ではない**（`.env.example` のコメントもこの前提）。

| 変数 | 説明 |
|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `docker compose` が postgres コンテナを初期化するときに使う。`POSTGRES_PASSWORD` は必須 |
| `DATABASE_URL` | アプリからの PostgreSQL 接続文字列（`postgresql://ユーザー:パスワード@ホスト:5432/DB名?schema=public`）。`npm run dev` でローカル起動するときはこれを自分で書く |
| `COLUMN_CONFIG_PATH` | `columns.json` のパス。**既定値は `/data/columns.json`（Docker前提）なので、ローカル開発では `./columns.json` を明示すること** |
| `SESSION_SECRET` | セッションJWTの署名鍵。**32文字以上**。下記コマンドで生成する |

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`.env.example` に入っている値はすべてダミー。**そのまま使わないこと。**

### 2. 開発用PostgreSQLの起動

```bash
docker compose up -d postgres
```

`docker-compose.yml` には `postgres` と `app`（アプリ本体）の2サービスがある。ローカル開発では `npm run dev` を使うので、**サービス名を明示して `postgres` だけを起動する。** 引数なしの `docker compose up -d` は `app` もビルドして 3010 番で起動するため、`npm run dev` とポートがぶつかる。

初回起動時に `docker-entrypoint-initdb.d` 経由で以下が名前順に実行される。

| 実行順 | ファイル | 内容 |
|---|---|---|
| 1 | `prisma/init.sql` | 住民テーブル（`resident_table`）の作成 |
| 2 | `prisma/auth_init.sql` | 認証用 `users` テーブルの作成 |

つまり **Docker で起動する限り `users` テーブルの手動作成は不要**。Docker を使わず既存のPostgreSQLに繋ぐ場合だけ、次を手で流す。

```bash
psql -h <ホスト> -U <ユーザー> -d <DB名> -f prisma/init.sql
psql -h <ホスト> -U <ユーザー> -d <DB名> -f prisma/auth_init.sql
```

DBはホストのループバック（`127.0.0.1:5432`）にのみ公開される。LANには出ない。

> `docker-compose.yml` は認証情報を直接持たず、すべて `.env` から読む。**開発環境で使ったパスワードを本番に持ち込まないこと。** `.env` は `.gitignore` 済みで、コミットされない。

すでにコンテナのボリュームが存在する場合、初期化スクリプトは**再実行されない**。作り直したいときはボリュームごと削除する。

```bash
docker compose down -v && docker compose up -d postgres
```

### 3. 依存パッケージのインストール

```bash
npm install
npx prisma generate
```

`npx prisma generate` はスキーマを変更したときに毎回必要になる。`npm run generate` でも同じ。

### 4. 職員アカウントの登録

ログインできるアカウントがないと何も表示できない。CLIで登録する。

```bash
node scripts/create-user.mjs <ログインID> <氏名> <部署> [admin|staff]
```

- `role` を省略すると `staff`
- パスワードは実行後にプロンプトで2回入力する。画面にはエコーされない
- パスワードは8文字以上

無効化する場合：

```bash
node scripts/disable-user.mjs <ログインID>
```

無効化してもレコードは削除されない（`is_active` が `false` になるだけ）。

### 5. 開発用ダミーデータ（任意）

住民データがないと動作確認ができないため、ダミーデータ生成スクリプトを同梱している。

```bash
npm run seed                        # prisma/seed.js（架空の住民データ）
node prisma/seed_additional.js      # 追加分
```

`npm run seed` は `package.json` の `prisma.seed` 設定により `prisma/seed.js` を実行する。`seed_additional.js` は自動では走らないので、必要なら直接実行する。
全列を持つテーブルで確認したい場合は `prisma/dev_init.sql`（`resident_table` を DROP して全列で作り直す）を適用してから実行する。

外部の人にレビューしてもらう場合や、世帯構成のパターンを一通り試したい場合は、リポジトリ直下の [`sample-data/`](../sample-data/README.md) を使う。

```bash
node ../../sample-data/scripts/load-postgres.mjs
```

11世帯27人分で、単身・夫婦・子育て・三世代・転入・転出・死亡・外国人住民などのパターンを1つずつ揃えてある。`prisma/seed.js` とは別系統のデータなので、**混ぜると宛名番号が衝突する。どちらか一方を使うこと。**

> **当然ながら、実在する住民のデータを開発環境に投入しないこと。**

### 6. 起動

```bash
npm run dev     # 開発サーバー
npm run build   # 本番ビルド
npm start       # 本番起動
```

`http://localhost:3010` を開く。未ログインなら `/login` に飛ばされる。

> ⚠️ `dev` と `start` はどちらも `-H 0.0.0.0` で待ち受ける。**起動したPCが接続しているネットワークの全端末からアクセスできる。** 庁内の他端末から使うための意図的な設定なので、カフェのWi-Fiや共用ネットワークでは起動しないこと。

---

## テスト

```bash
npm test        # vitest run
```

**pytest ではなく vitest を使う。** 現在テストがあるのは `lib/` の8ファイル。

| ファイル | 対象 |
|---|---|
| `lib/session.test.ts` | JWTの生成・検証、無操作/絶対タイムアウト、`SESSION_SECRET` 未設定・短すぎる場合のエラー |
| `lib/safeRedirect.test.ts` | オープンリダイレクト対策 |
| `lib/permissions.test.ts` | 実効的な閲覧可能列の計算（グループ+例外の合成） |
| `lib/permissionGroups.test.ts` | 権限グループの列展開、`basedOn` の循環参照検出 |
| `lib/fiscalYear.test.ts` | 年度末を期限の既定値として計算するロジック |
| `lib/auditDigest.test.ts` | 日次ダイジェストのハッシュ連結・改ざん検知ロジック |
| `lib/authFetch.test.ts` | 認証つきfetchラッパーの挙動 |
| `lib/columnDependencies.test.ts` | 列同士の依存関係の解決 |

APIルートとコンポーネントのテストは未整備。テストの追加は歓迎する。

`vitest.config.ts` で `@` エイリアスを `tsconfig.json` の `paths` に合わせている。新しくエイリアスを増やすときは両方を直すこと。

---

## Docker でのビルド

`Dockerfile` はマルチステージ構成（`base` → `deps` → `builder` → `runner`）。依存は lockfile どおりに入れるため `npm ci` を使い、`runner` には `next.config.ts` の `output: "standalone"` が生成する最小構成だけを置く。非rootユーザー（`nextjs`）で 3010 番を待ち受ける。

DB込みで一式を立ち上げる場合は compose から。

```bash
docker compose up -d --build     # postgres + app
docker compose logs -f app
```

初回起動時に `prisma/init.sql`（住民テーブル）と `prisma/auth_init.sql`（`users` テーブル）が自動で適用される。手動での `psql` 実行は不要。

職員アカウントの登録・無効化は、コンテナ内の CLI で行う。

```bash
docker compose exec app node scripts/create-user.mjs <ログインID> <氏名> <部署> [admin|staff]
docker compose exec app node scripts/disable-user.mjs <ログインID>
```

イメージだけ作りたい場合：

```bash
docker build -t mado-hub .
```

> **サンプルデータの投入（`npm run seed` および `sample-data/scripts/`）はコンテナ内では実行できない。**
> `runner` ステージには `prisma` CLI もシードスクリプトも含まれていないため。Node.js を導入した環境から `DATABASE_URL` を設定して実行すること。

- `app` コンテナの `COLUMN_CONFIG_PATH` は `/data/columns.json` で、ホストの `columns.json` を読み取り専用でマウントしている。カラム名を変えるときはホスト側のファイルを差し替えてコンテナを再起動するだけでよい
- `prisma/schema.prisma` の `binaryTargets` に `debian-openssl-3.0.x` を含めているのは、ローカル（native）とコンテナの両方でPrismaのクエリエンジンが動くようにするため。ここを削るとコンテナ内で Prisma が起動しない

---

## ハマりどころ

### Windows + WSL の Docker Engine を使う場合

自治体の検証端末などで、Docker Desktop ではなく **WSL 上の Docker Engine** だけを使う構成はよくある。このとき `docker-compose.yml` は Postgres をホストのループバック（`127.0.0.1:5432`）にだけ公開するため、**ポートは WSL 内の localhost にしか出ない**。Windows 側の Node.js から `DATABASE_URL=...@127.0.0.1:5432...` で繋ごうとしても届かない。

対処は次のとおり。

- `docker compose`・`npm install`・`npx prisma generate`・`npm run dev` は **すべて WSL 内で実行する**（Docker と Node を同じネットワーク名前空間に置く）
- Windows 側で入れた `node_modules` を WSL で流用しない。ネイティブ依存（例: `lightningcss`）のバイナリが OS と合わず、`/login` が 500 になる
- WSL に Node.js が無い場合は、WSL 内に Node.js 20 以上を入れる（`nvm` などユーザー権限の導入でも可）

Docker Desktop（Windows 統合）を使う場合は、ホストの `localhost:5432` にフォワードされるため、上記の切り分けは不要なことが多い。

### `columns.json` が読めていないのに気づかない

`lib/columns.ts` は設定ファイルの読み込みに失敗しても**例外を投げず、既定値にフォールバックする**。`COLUMN_CONFIG_PATH` の指定を忘れると、既定のカラム名（芽室町の出力仕様準拠）でSQLが組まれ、`列が存在しない` というDBエラーになる。「設定を書き換えたのに反映されない」ときは、まずパスを疑うこと。

### `SESSION_SECRET` を設定していない

`lib/session.ts` は `SESSION_SECRET` が未設定または32文字未満のとき、最初のセッション処理で明示的に例外を投げる。設定漏れに黙って弱い鍵で動き続けないための仕様。ログインしようとしてサーバエラーになる場合はここを確認する。

### `lib/session.ts` に依存を足してはいけない

`lib/session.ts` は `proxy.ts`（プロキシ層）から読み込まれる。この層では Node.js のフルAPIが使えないため、**`jose` 以外を import すると動かない**。特に Prisma や `bcryptjs` を足さないこと。DBアクセスが必要な処理は API Route 側に置く。

### `middleware.ts` ではなく `proxy.ts`

Next.js 16 で `middleware.ts` は非推奨になり、`proxy.ts` に置き換わっている。ネット上の記事や生成AIの出力は `middleware.ts` を前提にしていることが多い。**実装前に `node_modules/next/dist/docs/` の該当ガイドを読むこと。**

### `next/font/google` を使ってはいけない

本番環境はインターネットに接続できない。Googleフォントなど外部CDNに依存するコードを入れると、本番でビルド・起動できなくなる。フォントはローカルファイルかシステムフォントのみ。

### 日本語カラム名とダブルクォート

住民テーブルのカラム名は日本語。SQLに埋め込む列名は**必ず `lib/columns.ts` の `q()` を通す**こと。`q()` はダブルクォート内の `"` をエスケープしたうえで全体を囲む。素の文字列連結はSQLインジェクションの入口になる。

カスタム列APIのように利用者由来の列名を扱う場合は、`q()` に加えて `information_schema.columns` での実在確認と `lib/permissions.ts` による権限グループの対象列照合の**両方**を通すこと。片方だけにしない。

### クリップボードコピーが他端末で失敗する

`navigator.clipboard` は secure context（`https://` または `localhost`）でしか使えない。本番は `http://<サーバ>:3010` で配信するため、サーバ機以外のブラウザでは使えない。`lib/clipboard.ts` が `document.execCommand('copy')` にフォールバックする実装になっている。コピー処理を書くときは直接 `navigator.clipboard` を呼ばず、`copyTextToClipboard()` を使うこと。

### BigInt が JSON にできない

PostgreSQL の `BIGINT` 列は JavaScript の `BigInt` になり、`JSON.stringify` で例外になる。`lib/db.ts` と一部のAPIルートで `BigInt.prototype.toJSON` を定義して回避している。

---

## コーディング上の約束

- 住民データの取得は `SELECT` のみ。`hub` から住民データを更新しない
- APIレスポンスのキー名は固定エイリアスにする。DBのカラム名をそのままフロントに漏らさない
- 新しく住民テーブルの列を画面に出すときは、`lib/permissionGroups.ts` の権限グループ定義（`RESIDENT_BASIC_COLUMNS` 等）に追加する必要がある。**追加してよい列かどうかを必ず検討すること**（`基礎年金番号`・`在留カード等番号` などは意図的に除外している。`個人番号` はDDL・サンプルデータにも持たせていない。一方 `住民票コード` は現状含まれている。グループ定義の変更は全員の権限に一斉に影響するため、PRレビューを必ず通すこと。詳細は [ARCHITECTURE.md](ARCHITECTURE.md#権限設計の現状と限界)）
- **`個人番号` の列をDDL・サンプルデータ・許可リストに追加しないこと。** 意図的に持たせていない項目である（[REQUIREMENTS.md](REQUIREMENTS.md#機微な項目の扱い)）
- エラーメッセージに住民情報やSQLの詳細を含めない
- 配色は MADO ファミリーの `hub` パレット（`--mado-head` = `#00563E` 系）に従う。Tailwind の `text-mado-head` / `bg-mado-tint` などのトークンを使う
