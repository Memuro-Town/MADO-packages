import sqlite3
from datetime import datetime
import pandas as pd
import xlwings as xw
import os
import pyperclip
import time
import sys
import tkinter as tk
from tkinter import messagebox, ttk, scrolledtext
import re
import numpy as np
import configparser
from pathlib import Path

# ==========================================
# 設定: デザイン・フォント
# ==========================================
FONT_MAIN = ("Yu Gothic UI", 12)        # 通常の文字
FONT_BOLD = ("Yu Gothic UI", 12, "bold") # 太字
FONT_MONO = ("Consolas", 11)            # 等幅フォント
BG_COLOR = "#f0f0f0"                    # 背景色

# ==========================================
# DB接続（SQLite / PostgreSQL 切替）
# ==========================================
# 同ディレクトリの 申請書作成_db.ini を読む。無い場合は SQLite（Desktop/resident_RDB.db）。
# 例は 申請書作成_db.ini.example を参照。パスワードは ini / 環境変数のみ（スクリプトに書かない）。
#
# Postgres の本籍は hub と同じく「本籍」+「本籍_地番号または、街区符号」を連結する。
# （旧 SQLite 版が「本籍」単列だけ見ていたのが、本籍欠けの一因になりうる）

# exe(PyInstaller) 時は実行ファイルのあるフォルダを基準にする（隣の ini を読む）
if getattr(sys, "frozen", False):
    SCRIPT_DIR = Path(sys.executable).resolve().parent
else:
    SCRIPT_DIR = Path(__file__).resolve().parent

INI_NAME = "申請書作成_db.ini"


def resolve_ini_path():
    """exe/py と同じフォルダ優先。無ければ1つ上（USBルートに置いた場合）も見る。"""
    candidates = [SCRIPT_DIR / INI_NAME]
    parent_ini = SCRIPT_DIR.parent / INI_NAME
    if parent_ini.resolve() != candidates[0].resolve():
        candidates.append(parent_ini)
    for c in candidates:
        if c.exists():
            return c
    return candidates[0]


DB_INI_PATH = resolve_ini_path()


def load_db_config():
    """backend: sqlite | postgres。戻り値は dict（excel_path 含む）。"""
    desktop = Path(os.environ.get("USERPROFILE", "")) / "Desktop"
    cfg = {
        "backend": "sqlite",
        "sqlite_path": str(desktop / "resident_RDB.db"),
        "excel_path": str(desktop / "統一様式.xlsx"),
        "pg_host": os.environ.get("MADO_PG_HOST", ""),
        "pg_port": os.environ.get("MADO_PG_PORT", "5432"),
        "pg_dbname": os.environ.get("MADO_PG_DBNAME", "mado_hub"),
        "pg_user": os.environ.get("MADO_PG_USER", ""),
        "pg_password": os.environ.get("MADO_PG_PASSWORD", ""),
        "pg_sslmode": os.environ.get("MADO_PG_SSLMODE", "prefer"),
        "_ini_path": "",
        "_ini_loaded": False,
        "_excel_from_ini": False,
    }
    ini_path = resolve_ini_path()
    cfg["_ini_path"] = str(ini_path)
    # モジュール先頭の DB_INI_PATH も最新に合わせる
    global DB_INI_PATH
    DB_INI_PATH = ini_path
    if not ini_path.exists():
        return cfg

    parser = configparser.ConfigParser(interpolation=None)
    read_ok = parser.read(str(ini_path), encoding="utf-8")
    if not read_ok:
        return cfg
    cfg["_ini_loaded"] = True

    if parser.has_section("database"):
        sec = parser["database"]
        cfg["backend"] = sec.get("backend", cfg["backend"]).strip().lower()
        if sec.get("sqlite_path"):
            cfg["sqlite_path"] = sec.get("sqlite_path").strip().strip('"').strip("'")
        for key in ("pg_host", "pg_port", "pg_dbname", "pg_user", "pg_password", "pg_sslmode"):
            if sec.get(key):
                cfg[key] = sec.get(key).strip()

    excel = ""
    if parser.has_section("paths") and parser["paths"].get("excel_path"):
        excel = parser["paths"].get("excel_path").strip()
    elif parser.has_section("database") and parser["database"].get("excel_path"):
        excel = parser["database"].get("excel_path").strip()
    if excel:
        excel = excel.strip('"').strip("'")
        # サンプルのプレースホルダはそのまま使わない
        if excel and "..." not in excel and "（ユーザー名）" not in excel:
            cfg["excel_path"] = excel
            cfg["_excel_from_ini"] = True
    return cfg


def connect_db(cfg):
    """
    戻り値: (conn, dialect)
    dialect は 'sqlite' または 'postgres'
    """
    backend = cfg["backend"]
    if backend in ("postgres", "postgresql", "pg"):
        try:
            import psycopg2
        except ImportError as e:
            raise RuntimeError(
                "PostgreSQL 接続には psycopg2 が必要です。\n"
                "pip install psycopg2-binary"
            ) from e
        if not cfg["pg_host"] or not cfg["pg_user"]:
            raise RuntimeError(
                "Postgres 接続情報が不足しています。\n"
                f"{DB_INI_PATH} の pg_host / pg_user / pg_password を設定してください。"
            )
        conn = psycopg2.connect(
            host=cfg["pg_host"],
            port=int(cfg["pg_port"] or 5432),
            dbname=cfg["pg_dbname"] or "mado_hub",
            user=cfg["pg_user"],
            password=cfg["pg_password"],
            sslmode=cfg.get("pg_sslmode") or "prefer",
            connect_timeout=10,
        )
        return conn, "postgres"

    path = cfg["sqlite_path"]
    if not os.path.exists(path):
        raise FileNotFoundError(f"データベースが見つかりません: {path}")
    return sqlite3.connect(path), "sqlite"


def ph(dialect):
    """プレースホルダ。sqlite=? / postgres=%s"""
    return "%s" if dialect == "postgres" else "?"


def qident(name):
    """識別子をダブルクォートで囲む（日本語列名用）。"""
    return '"' + name.replace('"', '""') + '"'


def sql_coalesce_empty(col_sql, dialect):
    """空文字に潰す COALESCE/IFNULL。col_sql は既にクォート済みでも素の列名でも可。"""
    if dialect == "postgres":
        return f"COALESCE({col_sql}::text, '')"
    return f"IFNULL({col_sql}, '')"


def sql_address(dialect):
    """住所_町字 + 住所_番地号表記 → 住所"""
    a = qident("住所_町字")
    b = qident("住所_番地号表記")
    return f"{sql_coalesce_empty(a, dialect)} || {sql_coalesce_empty(b, dialect)} AS {qident('住所')}"


def sql_banchi(dialect):
    return f"{sql_coalesce_empty(qident('住所_番地号表記'), dialect)} AS {qident('番地')}"


def sql_kata(dialect):
    return f"{sql_coalesce_empty(qident('住所_方書'), dialect)} AS {qident('方書')}"


def sql_honseki(dialect):
    """
    本籍住所＋番地。
    - postgres: hub と同じ（本籍 + 本籍_地番号または、街区符号）
      ※ 本籍_町字 ではない。hub columns.ts の honseki / honseki_banchi に合わせる
    - sqlite: 旧スキーマの「本籍」単列
    """
    if dialect == "postgres":
        h = qident("本籍")
        b = qident("本籍_地番号または、街区符号")
        return (
            f"{sql_coalesce_empty(h, dialect)} || {sql_coalesce_empty(b, dialect)} "
            f"AS {qident('本籍住所＋番地')}"
        )
    return f"{sql_coalesce_empty(qident('本籍'), dialect)} AS {qident('本籍住所＋番地')}"


def sql_birthdate_text(dialect):
    """生年月日を文字列比較用に。"""
    col = qident("生年月日")
    return f"{col}::text" if dialect == "postgres" else col


def sql_name_kana(dialect):
    """実DBの氏名カナ列。SQLiteの旧列名は維持する。"""
    return qident("氏名_振り仮名（フリガナ）" if dialect == "postgres" else "氏名_フリガナ")


def sql_hitto(dialect):
    """PostgreSQLは筆頭者の単列、旧SQLiteは氏名を結合する。"""
    if dialect == "postgres":
        return f"{sql_coalesce_empty(qident('戸籍_筆頭者'), dialect)} AS {qident('筆頭者')}"
    uji = qident("戸籍_筆頭者_氏")
    mei = qident("戸籍_筆頭者_名")
    return (
        f"{sql_coalesce_empty(uji, dialect)} || ' ' || {sql_coalesce_empty(mei, dialect)} "
        f"AS {qident('筆頭者')}"
    )


def sql_detail_select(dialect):
    """本人／対象者の詳細 SELECT 句（共通）"""
    return f"""
        {qident('氏名')},
        {sql_name_kana(dialect)} AS {qident('カナ氏名')},
        {qident('生年月日')},
        {qident('性別表記')} AS {qident('性別')},
        {qident('世帯主氏名')} AS {qident('世帯主名')},
        {sql_address(dialect)},
        {sql_banchi(dialect)},
        {sql_kata(dialect)},
        {sql_honseki(dialect)},
        {sql_hitto(dialect)},
        {qident('宛名番号')} AS {qident('住民ｺｰﾄﾞ')},
        {qident('世帯番号')} AS {qident('世帯ｺｰﾄﾞ')}
    """

# 和暦変換用のヘルパー関数
def convert_to_wareki(date_val):
    if pd.isna(date_val): return ""
    try:
        if isinstance(date_val, str): d = pd.to_datetime(date_val)
        else: d = date_val
        y = d.year
        m_str = f"{d.month:02}".replace('0', ' ', 1)
        d_str = f"{d.day:02}".replace('0', ' ', 1)
        if y >= 2019: era, year = '令', y - 2018
        elif y >= 1989: era, year = '平', y - 1988
        elif y >= 1926: era, year = '昭', y - 1925
        elif y >= 1912: era, year = '大', y - 1911
        else: era, year = '明', y - 1867
        y_str = '元' if year == 1 else f"{year:02}".replace('0', ' ', 1)
        return f"{era}{y_str}.{m_str}.{d_str}"
    except: return str(date_val)

# ==========================================
# 独自UI: モダンな入力ダイアログ
# ==========================================
def show_custom_input_dialog(title, message, default_value="", is_list=False):
    """
    標準のsimpledialog.askstringの代わりに使用する、
    見やすく整列されたカスタムダイアログ。
    """
    dialog = tk.Toplevel()
    dialog.title(title)
    dialog.configure(bg=BG_COLOR)

    # ウィンドウサイズと位置の調整
    window_width = 600
    # 説明文と入力欄が切れないよう縦幅を確保する
    window_height = 680 if is_list else 500
    screen_width = dialog.winfo_screenwidth()
    screen_height = dialog.winfo_screenheight()
    x = int((screen_width / 2) - (window_width / 2))
    y = int((screen_height / 2) - (window_height / 2))
    dialog.geometry(f"{window_width}x{window_height}+{x}+{y}")

    dialog.transient()
    dialog.grab_set()

    # ★修正点1: ウィンドウ自体のフォーカスを少し遅延させる
    dialog.after(50, dialog.focus_force)

    result = {"value": None}

    # --- レイアウト ---
    main_frame = ttk.Frame(dialog, padding="20")
    main_frame.pack(fill=tk.BOTH, expand=True)

    # 1. メッセージ表示エリア
    if is_list:
        lbl_instruction = ttk.Label(main_frame, text="以下のリストから番号を選択（入力）してください:", font=FONT_BOLD)
        lbl_instruction.pack(anchor="w", pady=(0, 5))

        text_area = scrolledtext.ScrolledText(main_frame, height=10, font=FONT_MAIN, state='normal')
        text_area.insert(tk.END, message)
        text_area.configure(state='disabled')
        text_area.pack(fill=tk.BOTH, expand=True, pady=(0, 10))
    else:
        lbl_message = ttk.Label(main_frame, text=message, font=FONT_MAIN, wraplength=550)
        lbl_message.pack(anchor="w", pady=(0, 15), fill=tk.X)

    # 2. 入力エリア
    input_frame = ttk.Frame(main_frame)
    input_frame.pack(fill=tk.X, pady=(10, 0))

    ttk.Label(input_frame, text="入力:", font=FONT_BOLD).pack(side=tk.LEFT)

    entry = ttk.Entry(input_frame, font=FONT_MAIN, width=30)
    entry.pack(side=tk.LEFT, padx=(10, 0), fill=tk.X, expand=True, ipady=4)
    entry.insert(0, default_value)

    # ★修正点2: 入力欄へのカーソルセットを確実にする
    # ウィンドウ描画のタイミング待ち（100ms後）にフォーカスを強制する
    entry.focus_set()
    dialog.after(100, entry.focus_force)

    # 3. ボタンエリア
    btn_frame = ttk.Frame(main_frame)
    btn_frame.pack(fill=tk.X, pady=(20, 0), side=tk.BOTTOM)

    def on_ok(event=None):
        val = entry.get()
        if val.strip() == "":
            messagebox.showwarning("入力エラー", "値を入力してください", parent=dialog)
            # エラー時も入力欄に戻す
            entry.focus_force()
            return
        result["value"] = val
        dialog.destroy()

    def on_cancel(event=None):
        dialog.destroy()

    dialog.bind('<Return>', on_ok)
    dialog.bind('<Escape>', on_cancel)

    style = ttk.Style()
    style.configure("Accent.TButton", font=FONT_BOLD)

    btn_cancel = ttk.Button(btn_frame, text="キャンセル (Esc)", command=on_cancel)
    btn_cancel.pack(side=tk.RIGHT, padx=5)

    btn_ok = ttk.Button(btn_frame, text="決定 (Enter)", command=on_ok, style="Accent.TButton")
    btn_ok.pack(side=tk.RIGHT, padx=5)

    # フォント・表示倍率に応じて必要な高さを確保し、画面内に収める。
    dialog.update_idletasks()
    window_width = min(max(window_width, dialog.winfo_reqwidth()), max(1, screen_width - 40))
    window_height = min(max(window_height, dialog.winfo_reqheight()), max(1, screen_height - 100))
    x = max(0, (screen_width - window_width) // 2)
    y = max(0, (screen_height - window_height) // 2)
    dialog.geometry(f"{window_width}x{window_height}+{x}+{y}")
    dialog.resizable(True, True)
    dialog.wait_window()
    return result["value"]


# ==========================================
# 住民票オプション選択ダイアログ
# ==========================================
def show_jyuminhyo_options_dialog():
    """
    住民票の申請が含まれる場合のオプション選択ダイアログ。
    戻り値: dict または None（いいえの場合）
    """
    dialog = tk.Toplevel()
    dialog.title("住民票オプション")
    dialog.configure(bg=BG_COLOR)

    window_width = 500
    window_height = 520
    screen_width = dialog.winfo_screenwidth()
    screen_height = dialog.winfo_screenheight()
    x = int((screen_width / 2) - (window_width / 2))
    y = int((screen_height / 2) - (window_height / 2))
    dialog.geometry(f"{window_width}x{window_height}+{x}+{y}")

    dialog.transient()
    dialog.grab_set()
    dialog.after(50, dialog.focus_force)

    result = {"value": None}

    main_frame = ttk.Frame(dialog, padding="20")
    main_frame.pack(fill=tk.BOTH, expand=True)

    # 質問1: 住民票の申請が含まれますか
    lbl_q1 = ttk.Label(main_frame, text="住民票の申請が含まれますか？", font=FONT_BOLD)
    lbl_q1.pack(anchor="w", pady=(0, 10))

    include_jyuminhyo = tk.StringVar(value="いいえ")

    q1_frame = ttk.Frame(main_frame)
    q1_frame.pack(anchor="w", pady=(0, 15))

    rb_yes = ttk.Radiobutton(q1_frame, text="はい", variable=include_jyuminhyo, value="はい")
    rb_yes.pack(side=tk.LEFT, padx=(0, 20))
    rb_no = ttk.Radiobutton(q1_frame, text="いいえ", variable=include_jyuminhyo, value="いいえ")
    rb_no.pack(side=tk.LEFT)

    # オプションフレーム（住民票がはいの場合のみ有効）
    options_frame = ttk.LabelFrame(main_frame, text="住民票記載オプション", padding="10")
    options_frame.pack(fill=tk.X, pady=(10, 0))

    # 本籍の記載
    honseki_var = tk.StringVar(value="あり")
    ttk.Label(options_frame, text="本籍の記載:", font=FONT_MAIN).grid(row=0, column=0, sticky="w", pady=5)
    ttk.Radiobutton(options_frame, text="あり", variable=honseki_var, value="あり").grid(row=0, column=1, padx=5)
    ttk.Radiobutton(options_frame, text="なし", variable=honseki_var, value="なし").grid(row=0, column=2, padx=5)

    # 世帯主・続柄記載
    setainushi_var = tk.StringVar(value="あり")
    ttk.Label(options_frame, text="世帯主・続柄記載:", font=FONT_MAIN).grid(row=1, column=0, sticky="w", pady=5)
    ttk.Radiobutton(options_frame, text="あり", variable=setainushi_var, value="あり").grid(row=1, column=1, padx=5)
    ttk.Radiobutton(options_frame, text="なし", variable=setainushi_var, value="なし").grid(row=1, column=2, padx=5)

    # 個人番号の記載
    kojin_bango_var = tk.StringVar(value="なし")
    ttk.Label(options_frame, text="個人番号の記載:", font=FONT_MAIN).grid(row=2, column=0, sticky="w", pady=5)
    ttk.Radiobutton(options_frame, text="あり", variable=kojin_bango_var, value="あり").grid(row=2, column=1, padx=5)
    ttk.Radiobutton(options_frame, text="なし", variable=kojin_bango_var, value="なし").grid(row=2, column=2, padx=5)

    # 住民票コードの記載
    jyuminhyo_code_var = tk.StringVar(value="なし")
    ttk.Label(options_frame, text="住民票コードの記載:", font=FONT_MAIN).grid(row=3, column=0, sticky="w", pady=5)
    ttk.Radiobutton(options_frame, text="あり", variable=jyuminhyo_code_var, value="あり").grid(row=3, column=1, padx=5)
    ttk.Radiobutton(options_frame, text="なし", variable=jyuminhyo_code_var, value="なし").grid(row=3, column=2, padx=5)

    # オプションフレームの有効/無効を切り替え
    def toggle_options(*args):
        state = 'normal' if include_jyuminhyo.get() == "はい" else 'disabled'
        for child in options_frame.winfo_children():
            try:
                child.configure(state=state)
            except:
                pass

    include_jyuminhyo.trace_add('write', toggle_options)
    toggle_options()  # 初期状態設定

    # ボタンエリア
    btn_frame = ttk.Frame(main_frame)
    btn_frame.pack(fill=tk.X, pady=(20, 0), side=tk.BOTTOM)

    def on_ok(event=None):
        if include_jyuminhyo.get() == "はい":
            result["value"] = {
                "住民票申請": True,
                "本籍記載": honseki_var.get() == "あり",
                "世帯主続柄記載": setainushi_var.get() == "あり",
                "個人番号記載": kojin_bango_var.get() == "あり",
                "住民票コード記載": jyuminhyo_code_var.get() == "あり"
            }
        else:
            result["value"] = {
                "住民票申請": False,
                "本籍記載": False,
                "世帯主続柄記載": False,
                "個人番号記載": False,
                "住民票コード記載": False
            }
        dialog.destroy()

    def on_cancel(event=None):
        dialog.destroy()

    dialog.bind('<Return>', on_ok)
    dialog.bind('<Escape>', on_cancel)

    style = ttk.Style()
    style.configure("Accent.TButton", font=FONT_BOLD)

    btn_cancel = ttk.Button(btn_frame, text="キャンセル (Esc)", command=on_cancel)
    btn_cancel.pack(side=tk.RIGHT, padx=5)

    btn_ok = ttk.Button(btn_frame, text="決定 (Enter)", command=on_ok, style="Accent.TButton")
    btn_ok.pack(side=tk.RIGHT, padx=5)

    # フォント・表示倍率に応じて必要な高さを確保し、画面内に収める。
    dialog.update_idletasks()
    window_width = min(max(window_width, dialog.winfo_reqwidth()), max(1, screen_width - 40))
    window_height = min(max(window_height, dialog.winfo_reqheight()), max(1, screen_height - 100))
    x = max(0, (screen_width - window_width) // 2)
    y = max(0, (screen_height - window_height) // 2)
    dialog.geometry(f"{window_width}x{window_height}+{x}+{y}")
    dialog.resizable(True, True)
    dialog.wait_window()
    return result["value"]


def main():
    root = tk.Tk()
    root.withdraw()

    # ==========================================
    # 設定読込（ini: DB + Excelパス）
    # ==========================================
    try:
        db_cfg = load_db_config()
        conn_probe, dialect = connect_db(db_cfg)
        conn_probe.close()
    except Exception as e:
        messagebox.showerror("DB接続エラー", str(e))
        return

    excel_path = db_cfg["excel_path"]
    if not os.path.exists(excel_path):
        messagebox.showerror(
            "Excelファイルエラー",
            f"帳票Excelが見つかりません:\n{excel_path}\n\n"
            f"{DB_INI_PATH} の [paths] excel_path を確認してください。",
        )
        return

    backend_label = "PostgreSQL (mado-hub)" if dialect == "postgres" else f"SQLite ({db_cfg['sqlite_path']})"
    print(f"[申請書作成 7.6] DB: {backend_label}")
    print(f"[申請書作成 7.6] ini: {db_cfg.get('_ini_path')} (loaded={db_cfg.get('_ini_loaded')})")
    print(f"[申請書作成 7.6] Excel: {excel_path} (from_ini={db_cfg.get('_excel_from_ini')})")
    if not db_cfg.get("_ini_loaded"):
        messagebox.showwarning(
            "設定ファイル未検出",
            f"{INI_NAME} が見つかりません。\n"
            f"想定場所: {SCRIPT_DIR / INI_NAME}\n\n"
            "Excel は省略時の Desktop\\統一様式.xlsx を使います。\n"
            "申請書作成_db.ini.example をコピーして同フォルダに置いてください。",
        )
    elif not db_cfg.get("_excel_from_ini"):
        messagebox.showwarning(
            "Excelパス未設定",
            f"ini は読みましたが [paths] excel_path が有効ではありません。\n"
            f"行頭が ; のままだとコメント扱いで無視されます。\n\n"
            f"ファイル: {db_cfg.get('_ini_path')}\n"
            f"現在のExcel: {excel_path}",
        )

    # ==========================================
    # メインループ
    # ==========================================
    while True:
        conn = None
        try:
            conn, dialect = connect_db(db_cfg)
            cur = conn.cursor()
            p = ph(dialect)

            seireki_birthday_search = None
            selected_jyumin_code = None
            hitsuyo_df = None
            df = pd.DataFrame()
            jyuminhyo_options = None  # 住民票オプション

            # ---------------------------------------------------------
            # 1. 最初の入力
            # ---------------------------------------------------------
            msg_top = (
                "【トップメニュー】\n\n"
                f"申請書作成フォームです。（DB: {backend_label}）\n"
                "以下のいずれかを入力してください：\n"
                "  ・生年月日（和暦7桁 例:4050101）\n"
                "  ・生年月日（西暦8桁 例:19930101）\n"
                "  ・住民コード（宛名番号）"
            )
            input_value = show_custom_input_dialog("申請書作成", msg_top)

            if input_value is None:
                if messagebox.askyesno("終了確認", "プログラムを終了しますか？"):
                    print("終了")
                    break
                else:
                    continue

            records = []

            # --- 検索ロジック ---
            address_sql = sql_address(dialect)
            search_select = (
                f"{qident('生年月日')}, {sql_name_kana(dialect)}, {qident('氏名')}, "
                f"{qident('宛名番号')}, {qident('世帯番号')}, {address_sql}"
            )

            if len(input_value) == 7 and int(input_value) < 8000000:  # 和暦
                era_code = int(input_value[0])
                wareki_year = int(input_value[1:3])
                seireki_year = 0
                if era_code == 1: seireki_year = 1868 + wareki_year - 1
                elif era_code == 2: seireki_year = 1912 + wareki_year - 1
                elif era_code == 3: seireki_year = 1926 + wareki_year - 1
                elif era_code == 4: seireki_year = 1989 + wareki_year - 1
                elif era_code == 5: seireki_year = 2019 + wareki_year - 1

                month = input_value[3:5]
                day = input_value[5:]
                seireki_birthday_search = f"{seireki_year}-{month}-{day}"
                birth_col = sql_birthdate_text(dialect)

                cur.execute(f"""
                    SELECT {search_select}
                    FROM {qident('resident_table')}
                    WHERE {birth_col} LIKE {p} OR {birth_col} LIKE {p}
                """, (f"{seireki_birthday_search}%", f"{seireki_year}/{month}/{day}%"))

            elif len(input_value) == 8 and 19000101 <= int(input_value) < 20400000: # 西暦
                seireki_year = input_value[0:4]
                seireki_month = input_value[4:6]
                seireki_day = input_value[6:]
                seireki_birthday_search = f"{seireki_year}-{seireki_month}-{seireki_day}"
                birth_col = sql_birthdate_text(dialect)

                cur.execute(f"""
                    SELECT {search_select}
                    FROM {qident('resident_table')}
                    WHERE {birth_col} LIKE {p} OR {birth_col} LIKE {p}
                """, (f"{seireki_birthday_search}%", f"{seireki_year}/{seireki_month}/{seireki_day}%"))

            else:  # 住民コード
                atena_param = int(input_value) if str(input_value).isdigit() else input_value
                cur.execute(f"""
                    SELECT {search_select}
                    FROM {qident('resident_table')}
                    WHERE {qident('宛名番号')} = {p}
                """, (atena_param,))

            records = cur.fetchall()

            # ---------------------------------------------------------
            # 2. 検索結果の選択
            # ---------------------------------------------------------
            if records:
                result_message = ""
                for i, record in enumerate(records):
                    wareki_disp = convert_to_wareki(record[0])
                    address_disp = record[5] if len(record) > 5 and record[5] else ''

                    result_message += f"【{i + 1}】 {record[2]} ({record[1]})\n"
                    result_message += f"      生年月日: {wareki_disp}  住所: {address_disp}\n"
                    result_message += "-" * 40 + "\n"

                choice_str = show_custom_input_dialog("対象者選択", result_message, is_list=True)

                if choice_str is None: continue

                if choice_str.isdigit():
                    choice = int(choice_str)
                    if 1 <= choice <= len(records):
                        selected_record = records[choice - 1]
                        selected_jyumin_code = selected_record[3]
                    else:
                        messagebox.showwarning("警告", "無効な番号です。")
                        continue
                else:
                    messagebox.showwarning("警告", "数字を入力してください。")
                    continue
            else:
                messagebox.showinfo("検索結果", "該当データなし")
                continue

            # ---------------------------------------------------------
            # 3. 詳細情報の取得と世帯選択
            # ---------------------------------------------------------
            if selected_jyumin_code is not None:
                # 自身の情報取得
                query = f"""
                    SELECT {sql_detail_select(dialect)}
                    FROM {qident('resident_table')}
                    WHERE {qident('宛名番号')} = {p}
                """
                df = pd.read_sql_query(query, conn, params=(selected_jyumin_code,))

                df['住所_full'] = '芽室町' + df['住所'].fillna('') + ' ' + df['方書'].fillna('')
                df['生和暦年月日'] = df['生年月日'].apply(convert_to_wareki)

                setai_code = int(float(df['世帯ｺｰﾄﾞ'].iloc[0]))

                # 世帯一覧取得
                house_query = f"""
                    SELECT {sql_name_kana(dialect)} AS {qident('カナ氏名')},
                           {qident('氏名')},
                           {qident('続柄表記')} AS {qident('続柄')}
                    FROM {qident('resident_table')}
                    WHERE {qident('世帯番号')} = {p}
                    ORDER BY {qident('記載順位')} ASC
                """
                house_df = pd.read_sql_query(house_query, conn, params=(setai_code,))

                house_msg = house_df.to_string(index=False, header=['カナ', '氏名', '続柄'])

                prompt_msg = (
                    f"【世帯構成】\n{house_msg}\n\n"
                    "--------------------------------------------------\n"
                    "証明書が必要な方の世帯区分を選択してください：\n\n"
                    "  1 : 同じ世帯の人\n"
                    "  2 : 別世帯の人"
                )

                choice_str = show_custom_input_dialog("世帯区分選択", prompt_msg, is_list=True)

                if choice_str is None: continue

                # === パターン1: 同一世帯 ===
                if choice_str == '1':
                    if not df.empty:
                        household_query = f"""
                            SELECT {sql_name_kana(dialect)} AS {qident('カナ氏名')},
                                   {qident('氏名')},
                                   {qident('続柄表記')} AS {qident('続柄')},
                                   {qident('宛名番号')} AS {qident('住民ｺｰﾄﾞ')},
                                   {sql_honseki(dialect)},
                                   {qident('住民状態')}
                            FROM {qident('resident_table')}
                            WHERE {qident('世帯番号')} = {p}
                            ORDER BY {qident('記載順位')} ASC
                        """
                        household_df = pd.read_sql_query(household_query, conn, params=(setai_code,))

                        # 住民状態の変換辞書
                        jyumin_status_dict = {1: "住民", 2: "転出者", 3: "死亡者", 9: "消除者"}

                        result_member = ""
                        for i, row in household_df.iterrows():
                            # 住民状態を取得して文言に変換
                            status_code = row.get('住民状態', 1)

                            # 住民以外は★で目立たせて続柄の後ろに表示、住民(1)は表示なし
                            if status_code != 1 and pd.notna(status_code):
                                status_text = jyumin_status_dict.get(int(status_code), "不明")
                                status_suffix = f" ★★{status_text}★★"
                            else:
                                status_suffix = ""

                            result_member += f"【{i + 1}】 {row['氏名']} ({row['続柄']}){status_suffix}\n"
                            result_member += f"      カナ: {row['カナ氏名']}\n"
                            result_member += "-" * 40 + "\n"

                        member_choice_str = show_custom_input_dialog("必要対象者選択", result_member, is_list=True)

                        if member_choice_str is None: continue

                        if member_choice_str.isdigit():
                            member_choice = int(member_choice_str)
                            if 1 <= member_choice <= len(household_df):
                                selected_member = household_df.iloc[member_choice - 1]
                                selected_member_code = int(float(selected_member['住民ｺｰﾄﾞ']))

                                pyperclip.copy(str(int(selected_member_code)))

                                member_details_query = f"""
                                    SELECT {sql_detail_select(dialect)}
                                    FROM {qident('resident_table')}
                                    WHERE {qident('宛名番号')} = {p}
                                """
                                hitsuyo_df = pd.read_sql_query(member_details_query, conn, params=(selected_member_code,))

                                if not hitsuyo_df.empty:
                                    hitsuyo_df['生和暦年月日'] = hitsuyo_df['生年月日'].apply(convert_to_wareki)
                                else:
                                    messagebox.showinfo("情報", "詳細情報が見つかりません。")
                                    continue
                            else:
                                messagebox.showwarning("警告", "無効な番号です。")
                                continue
                        else:
                            messagebox.showwarning("警告", "数字を入力してください。")
                            continue

                # === パターン2: 別世帯 ===
                elif choice_str == '2':
                    info_msg = (
                        "証明書が必要な方の情報を選択してください。\n\n"
                        "  1 : 町民（委任状・第三者請求）\n"
                        "      → 申請書に情報を自動転記します。\n\n"
                        "  2 : 町外の方 または 手書き希望\n"
                        "      → 紙に記入してください。"
                    )
                    info_choice_str = show_custom_input_dialog("申請形態選択", info_msg, is_list=True)

                    if info_choice_str is None: continue

                    if info_choice_str == '1':
                        search_msg = (
                            "必要とする方の情報を入力してください。\n"
                            "・生年月日（和暦7桁 例:4050101）\n"
                            "・カナ氏名（半角スペース入り 例:ヤマダ タロウ）"
                        )
                        input_hitsuyo_value = show_custom_input_dialog("対象者検索", search_msg)

                        if input_hitsuyo_value is None: continue

                        hitsuyo_records = []
                        if len(input_hitsuyo_value) == 7 and (re.match(r'^\d{7}$', input_hitsuyo_value)):
                            era_code = int(input_hitsuyo_value[0])
                            wareki_year = int(input_hitsuyo_value[1:3])
                            s_year = 0
                            if era_code == 1: s_year = 1868 + wareki_year - 1
                            elif era_code == 2: s_year = 1912 + wareki_year - 1
                            elif era_code == 3: s_year = 1926 + wareki_year - 1
                            elif era_code == 4: s_year = 1989 + wareki_year - 1
                            elif era_code == 5: s_year = 2019 + wareki_year - 1
                            s_month = input_hitsuyo_value[3:5]
                            s_day = input_hitsuyo_value[5:]
                            search_date_str = f"{s_year}-{s_month}-{s_day}"

                            birth_col = sql_birthdate_text(dialect)
                            cur.execute(f"""
                                SELECT {qident('生年月日')}, {sql_name_kana(dialect)}, {qident('氏名')},
                                       {qident('宛名番号')}, {qident('世帯番号')}, {qident('住民状態')}
                                FROM {qident('resident_table')}
                                WHERE {birth_col} LIKE {p}
                            """, (f"{search_date_str}%",))
                            hitsuyo_records = cur.fetchall()

                        elif re.match(r'^[ｱ-ﾝ\s]+$', input_hitsuyo_value):
                            cur.execute(f"""
                                SELECT {qident('生年月日')}, {sql_name_kana(dialect)}, {qident('氏名')},
                                       {qident('宛名番号')}, {qident('世帯番号')}, {qident('住民状態')}
                                FROM {qident('resident_table')}
                                WHERE {sql_name_kana(dialect)} = {p}
                            """, (input_hitsuyo_value,))
                            hitsuyo_records = cur.fetchall()

                        if hitsuyo_records:
                            # 住民状態の変換辞書
                            jyumin_status_dict = {1: "住民", 2: "転出者", 3: "死亡者", 9: "消除者"}

                            result_hitsuyo = ""
                            for j, h_rec in enumerate(hitsuyo_records):
                                w_disp = convert_to_wareki(h_rec[0])
                                # 住民状態を取得して文言に変換 (h_rec[5]が住民状態)
                                status_code = h_rec[5] if len(h_rec) > 5 else 1

                                # 住民以外は★で目立たせて名前の後ろに表示、住民(1)は表示なし
                                if status_code and status_code != 1:
                                    status_text = jyumin_status_dict.get(int(status_code), "不明")
                                    status_suffix = f" ★★{status_text}★★"
                                else:
                                    status_suffix = ""

                                result_hitsuyo += f"【{j + 1}】 {h_rec[2]} ({h_rec[1]}){status_suffix}\n"
                                result_hitsuyo += f"      生年月日: {w_disp}\n"
                                result_hitsuyo += "-" * 40 + "\n"

                            hitsuyo_choice_str = show_custom_input_dialog("必要対象者選択", result_hitsuyo, is_list=True)

                            if hitsuyo_choice_str is None: continue

                            if hitsuyo_choice_str.isdigit():
                                hitsuyo_choice = int(hitsuyo_choice_str)
                                if 1 <= hitsuyo_choice <= len(hitsuyo_records):
                                    sel_rec = hitsuyo_records[hitsuyo_choice - 1]
                                    sel_code = sel_rec[3]

                                    member_details_query = f"""
                                        SELECT {sql_detail_select(dialect)}
                                        FROM {qident('resident_table')}
                                        WHERE {qident('宛名番号')} = {p}
                                    """
                                    hitsuyo_df = pd.read_sql_query(member_details_query, conn, params=(sel_code,))
                                    if not hitsuyo_df.empty:
                                        hitsuyo_df['生和暦年月日'] = hitsuyo_df['生年月日'].apply(convert_to_wareki)
                                    else:
                                        messagebox.showinfo("情報", "詳細情報が見つかりません。")
                                        continue
                                    pyperclip.copy(str(int(sel_code)))
                                else:
                                     messagebox.showwarning("警告", "無効な番号です。")
                                     continue
                            else:
                                messagebox.showwarning("警告", "数字を入力してください。")
                                continue
                        else:
                            messagebox.showinfo("検索結果", "該当データなし")
                            continue

                    elif info_choice_str == '2':
                        messagebox.showinfo("案内", "必要な方の情報を紙に記入してください。")
                        hitsuyo_df = None
                    else:
                        messagebox.showwarning("警告", "無効な選択です。")
                        continue

                else:
                    messagebox.showwarning("警告", "無効な選択です。")
                    continue

                # ---------------------------------------------------------
                # 4. 住民票オプション選択
                # ---------------------------------------------------------
                jyuminhyo_options = show_jyuminhyo_options_dialog()

                if jyuminhyo_options is None:
                    continue  # キャンセルされた場合はループに戻る

                # ---------------------------------------------------------
                # 5. Excelへの書き込み
                # ---------------------------------------------------------
                print("申請書を作成中です...")

                try:
                    app = xw.App(visible=True, add_book=False)
                    wb_xlwings = app.books.open(excel_path)
                    ws_xlwings = wb_xlwings.sheets[0]

                    # クリア処理
                    ws_xlwings.range('T2:BZ2').value = ""
                    ws_xlwings.range('E23:E27').value = ""
                    ws_xlwings.range('E31:E40').value = ""
                    ws_xlwings.range('N23:O25').value = ""
                    ws_xlwings.range('N26:N27').value = ""
                    ws_xlwings.range('N28:O38').value = ""
                    ws_xlwings.range('M37:M38').value = ""

                    if not df.empty:
                        ws_xlwings.range('T2').value = df.where(pd.notnull(df), None).values.tolist()

                    if hitsuyo_df is not None and not hitsuyo_df.empty:
                        ws_xlwings.range('AJ2').value = hitsuyo_df.where(pd.notnull(hitsuyo_df), None).values.tolist()
                    else:
                        ws_xlwings.range('AJ2').value = ""

                    # 住民票オプションをエクセルに書き込み（貼り付けの最後に追記）
                    # BA列以降に住民票オプションフラグを書き込み
                    if jyuminhyo_options:
                        jyuminhyo_flags = [
                            "1" if jyuminhyo_options.get("住民票申請", False) else "0",
                            "1" if jyuminhyo_options.get("本籍記載", False) else "0",
                            # ダイアログ側のキーは「世帯主続柄記載」（中黒なし）。旧バグ修正
                            "1" if jyuminhyo_options.get("世帯主続柄記載", False) else "0",
                            "1" if jyuminhyo_options.get("個人番号記載", False) else "0",
                            "1" if jyuminhyo_options.get("住民票コード記載", False) else "0"
                        ]
                        ws_xlwings.range('BA2').value = jyuminhyo_flags

                    time.sleep(1)

                except Exception as e:
                    messagebox.showerror("エラー", f"Excel操作エラー: {e}")

        except Exception as e:
             messagebox.showerror("システムエラー", f"予期せぬエラー: {e}")
        finally:
            if conn: conn.close()

if __name__ == "__main__":
    main()
