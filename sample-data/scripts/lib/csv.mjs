// sample-data 用の最小 CSV パーサ。
// 外部パッケージに依存しない（本番環境はオフラインの閉域網のため）。

import { readFileSync } from 'node:fs';

/** RFC 4180 相当の CSV を配列の配列に変換する */
export function parseCsv(text) {
  // BOM を除去（csv/ の CSV は BOM 付きUTF-8。理由は sample-data/README.md 参照）
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  // CRLF / CR を LF に正規化
  text = text.replace(/\r\n?/g, '\n');

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  // 末尾の空行を落とす
  return rows.filter(r => !(r.length === 1 && r[0] === ''));
}

/**
 * CSV を { 見出し名: 値 } のオブジェクト配列として読み込む。
 * 空文字はそのまま空文字で返す（NULL への変換は呼び出し側の責任）。
 */
export function readCsvObjects(path) {
  const rows = parseCsv(readFileSync(path, 'utf8'));
  if (rows.length === 0) return { header: [], records: [] };
  const [header, ...body] = rows;
  const records = body.map((r, idx) => {
    if (r.length !== header.length) {
      throw new Error(`${path}: ${idx + 2} 行目の列数が見出しと一致しません (${r.length} / ${header.length})`);
    }
    return Object.fromEntries(header.map((h, i) => [h, r[i]]));
  });
  return { header, records };
}

/**
 * SQL のリテラルに変換する。
 * 空文字は NULL、それ以外はシングルクォート文字列にする。
 * 数値カラムであっても文字列リテラルで渡す（PostgreSQL / SQLite の
 * いずれも INSERT 時に列の型へ暗黙変換するため、DDL の型定義に
 * 依存せず init.sql / dev_init.sql の双方に投入できる）。
 */
export function sqlLiteral(value) {
  if (value === null || value === undefined || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** 識別子をダブルクォートで囲む（日本語カラム名のため必須） */
export function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}
