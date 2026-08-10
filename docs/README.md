# MADO hub — ドキュメント一覧 (Index)

このディレクトリには、住民情報データ出力パッケージ `hub` に関する要件定義、システム設計、開発ガイド、および導入実績などの詳細ドキュメントが格納されています。

## ドキュメントマップ

| ドキュメント | 説明 | 対象読者 |
| :--- | :--- | :--- |
| [REQUIREMENTS.md](REQUIREMENTS.md) | **業務要件定義書**<br>なぜこのシステムが必要なのか、解決する課題と業務フロー。接続先となる住民データベースのカラム要件。 | 導入検討自治体、業務設計者、全開発者 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | **システム設計書（アーキテクチャ）**<br>技術スタック、データベース、API定義、認証と権限設計、SQL組み立ての仕組み。 | コントリビューター、システム管理者、エンジニア |
| [DEVELOPMENT.md](DEVELOPMENT.md) | **開発・環境構築ガイド**<br>ローカル開発環境のセットアップ、職員アカウントの作成、テストの実行、ハマりどころ。 | 開発者、コントリビューター |
| [USE_CASES.md](USE_CASES.md) | **現場での使い方**<br>窓口でどう使われているか、なぜこの画面・この操作になったのかの設計背景。 | 導入検討自治体、業務設計者、初めて触る人 |
| [DESIGN.md](DESIGN.md) | **配色規定**<br>MADOファミリー共通の配色パレットと、守るべきルール。 | `form`/`care`/`move`に携わる開発者、デザインレビュー担当者 |
| [FORKED_SITES.md](https://github.com/Memuro-Town/MADO/blob/main/FORKED_SITES.md) | **導入自治体一覧**<br>MADOを導入・フォークして運用している自治体の一覧。全パッケージ共通のため `MADO` リポジトリで一元管理している。 | 導入検討自治体、全閲覧者 |

---

## 関連リソース（ルートディレクトリ）
- [README.md](../README.md): プロジェクトの概要とクイックスタート。
- [packages/hub/README.md](../packages/hub/README.md): `hub` パッケージ固有の設定（`columns.json` のカラム名マッピング等）。
- [CONTRIBUTING.md](../CONTRIBUTING.md): コントリビュート（コード貢献など）に関するガイドライン。
- [SECURITY.md](../SECURITY.md): 脆弱性報告やセキュリティに関するポリシー。
- [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md): コミュニティにおける行動規範。
