# resident_data_to_db_pg.py

窓口BPRが出力するCSV（宛名システムのエクスポート）を読み込み、
オフラインサーバーのPostgreSQLに `resident_table_all` / `resident_table` として書き込む定期取込スクリプト。

元は `resident_data_to_db_3.0_inkan.py`（SQLite版）のコピーを PostgreSQL 向けに書き換えたもの。
**元ファイルは直接編集しないこと。** 本体は個人のmyprojectフォルダに残したまま、
このリポジトリ側のコピーだけを更新・運用する。

---

## 実行環境

- 同じネットワーク内の窓口PCから実行する想定（オフラインサーバーのPostgreSQLへ直接接続）
- 追加で必要なPythonパッケージ: `pandas`, `chardet`, `sqlalchemy`, `psycopg2-binary`
  - 窓口PCがオフラインの場合、これらのwheelファイルを事前にダウンロードしUSBで持ち込み、
    `pip install --no-index --find-links <wheelフォルダ> パッケージ名` の形でインストールすること

## 設定

`.env.example` を `.env` にコピーして値を設定する（**`.env` はコミットしないこと。内部サーバー名・DB接続情報を含むため**）。

```
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<db>
CSV_SOURCE_DIR=\\<内部サーバー名>\<共有ディスク>\<業務フォルダ>\csv
```

## 実行

```bash
python resident_data_to_db_pg.py
```

`CSV_SOURCE_DIR` にある `URE*.CSV` のうち最新の更新日時のファイルを1件読み込み、
`resident_table_all`（全件）と `resident_table`（`最新フラグ=1` のみ）を **DROP → 再作成**する。

## 注意点

- テーブルを毎回 DROP して作り直すため、実行中は hub からの参照が一時的にエラーになり得る。
  営業時間外や利用の少ない時間帯に実行することを推奨する。
- 列の型は pandas の `to_sql` が自動推定したものになる（SQLite版と同じ挙動を踏襲）。
  数値列で意図しない型になった場合は、hub側APIのCOALESCE等で `::text` キャストが必要になる可能性がある
  （`260625_SQLite_PostgreSQL移行手順.md` で見つかった型不整合と同種の問題）。
- `resident_table` には主キー制約は付与されない（元のSQLite版と同じ）。
  hubアプリ側が想定する列名（日本語カラム名）はCSVの列名にそのまま依存する。
