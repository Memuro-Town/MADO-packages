import pandas as pd
import glob
import os
import sys
import chardet
from sqlalchemy import create_engine, text

# ===== .env 読み込み（外部依存なしの簡易パーサー） =====
# 内部サーバー名・DB接続情報をコードに直書きしないため、
# 実行ファイル(.py または PyInstaller の .exe)と同じフォルダの .env から読む。
# .env は必ず .gitignore 対象にすること。
def _base_dir():
    if getattr(sys, 'frozen', False):
        # PyInstallerでexe化された場合、__file__は一時展開先を指すため使えない。
        # sys.executable（実際に配置したexeのパス）の場所を基準にする。
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


def load_env(path=None):
    path = path or os.path.join(_base_dir(), '.env')
    env = {}
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                key, _, value = line.partition('=')
                env[key.strip()] = value.strip().strip('"').strip("'")
    return env


env = {**load_env(), **os.environ}

DATABASE_URL = env.get('DATABASE_URL')
CSV_SOURCE_DIR = env.get('CSV_SOURCE_DIR')
EXPECTED_DB_NAME = env.get('EXPECTED_DB_NAME')

if not DATABASE_URL:
    print("エラー: DATABASE_URL が設定されていません（.env を確認してください）")
    sys.exit(1)
if not CSV_SOURCE_DIR:
    print("エラー: CSV_SOURCE_DIR が設定されていません（.env を確認してください）")
    sys.exit(1)
if not EXPECTED_DB_NAME:
    print("エラー: EXPECTED_DB_NAME が設定されていません（.env を確認してください）")
    print("誤ったデータベースへの書き込みを防ぐため、接続先DB名の確認が必須です。")
    sys.exit(1)

# ===== CSVファイル検索 =====
csv_files = glob.glob(f'{CSV_SOURCE_DIR}/URE*.CSV')

if not csv_files:
    print("エラー: CSVファイルが見つかりませんでした。")
    sys.exit(1)

# 最新のCSVファイルを見つける
latest_file = max(csv_files, key=os.path.getmtime)
print(f"処理対象ファイル: {latest_file}")

# ===== エンコーディング検出 =====
with open(latest_file, 'rb') as f:
    result = chardet.detect(f.read(100000))
encoding = result['encoding']
print(f"検出されたエンコーディング: {encoding}")

# ===== CSV読み込み =====
print("CSVファイルを読み込み中...")
df = pd.read_csv(latest_file, encoding=encoding, low_memory=False)

# 個人番号（マイナンバー）はCSVに含まれていても構造的に持ち込まない。
# resident_table_all / resident_table はこのDataFrameの列構成をそのまま引き継ぐため、
# ここで落としておかないと、CSVに列がある限り取り込まれ続けてしまう。
EXCLUDED_COLUMNS = ['個人番号']
dropped = [c for c in EXCLUDED_COLUMNS if c in df.columns]
if dropped:
    print(f"以下の列は取り込み対象から除外します: {dropped}")
    df = df.drop(columns=dropped)

total_records = len(df)
print(f"全レコード数: {total_records:,}")

# ===== データベース接続（PostgreSQL） =====
engine = create_engine(DATABASE_URL)

# 接続先DB名が想定通りかを確認する（誤った実在DBへの書き込み事故を防ぐ安全確認）
with engine.connect() as check_conn:
    actual_db_name = check_conn.execute(text("SELECT current_database()")).scalar()

print(f"接続先データベース: {actual_db_name}")
if actual_db_name != EXPECTED_DB_NAME:
    print(f"エラー: 接続先データベース \"{actual_db_name}\" が想定 \"{EXPECTED_DB_NAME}\" と一致しません。")
    print(".env の DATABASE_URL / EXPECTED_DB_NAME を確認してください。処理を中断します。")
    sys.exit(1)

with engine.begin() as conn:
    # ===== テーブル1: 全データテーブル (resident_table_all) =====
    print("\n全データテーブル (resident_table_all) を作成中...")

    conn.execute(text("DROP TABLE IF EXISTS resident_table_all"))

    # DataFrameをPostgreSQLに挿入（列名はSQLAlchemy側で自動的に二重引用符クォートされる）
    df.to_sql('resident_table_all', conn, if_exists='replace', index=False)
    print(f"resident_table_all: {total_records:,} 件を登録完了")

    # ===== テーブル2: 最新フラグのみのテーブル (resident_table) =====
    print("\n最新データテーブル (resident_table) を作成中...")

    conn.execute(text("DROP TABLE IF EXISTS resident_table"))

    conn.execute(text("""
        CREATE TABLE resident_table AS
        SELECT * FROM resident_table_all
        WHERE "最新フラグ" = 1
    """))

    latest_count = conn.execute(text("SELECT COUNT(*) FROM resident_table")).scalar()
    print(f"resident_table: {latest_count:,} 件を登録完了 (最新フラグ=1のみ)")

    # ===== インデックス作成 =====
    print("\nインデックスを作成中...")

    index_columns = [
        ('idx_atena', '宛名番号'),
        ('idx_setai', '世帯番号'),
        ('idx_birthdate', '生年月日'),
        ('idx_jumincode', '住民票コード'),
    ]

    for idx_name, col_name in index_columns:
        try:
            conn.execute(text(f'CREATE INDEX {idx_name} ON resident_table ("{col_name}")'))
            print(f"  {idx_name} ({col_name}) - 作成完了")
        except Exception as e:
            print(f"  {idx_name} ({col_name}) - エラー: {e}")

print(f"\n処理完了！")
print(f"  - resident_table_all: 全 {total_records:,} 件")
print(f"  - resident_table: 最新 {latest_count:,} 件 (最新フラグ=1)")
