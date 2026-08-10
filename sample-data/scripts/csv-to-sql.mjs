#!/usr/bin/env node
// =============================================================================
// sample-data/csv/resident_table.csv を INSERT 文の並んだ .sql に変換する。
//
// PostgreSQL / SQLite のどちらにも投入できる形で出力する。
// psql や sqlite3 のCLIしかない環境（Node の DB ドライバを入れられない環境）でも
// 使えるようにするための経路。
//
//   node sample-data/scripts/csv-to-sql.mjs --dialect postgres > sample-data.sql
//   node sample-data/scripts/csv-to-sql.mjs --dialect sqlite   > sample-data.sql
//   node sample-data/scripts/csv-to-sql.mjs --dialect postgres --truncate
//
//   # PostgreSQL へ
//   psql "$DATABASE_URL" -f sample-data.sql
//   # SQLite へ（form / care / move の現行モデル向け）
//   sqlite3 <DBファイル> < sample-data.sql
//
// 出力先の resident_table は事前に作成しておくこと。
// PostgreSQL は packages/hub/prisma/init.sql（docker compose が初回起動時に実行）
// または packages/hub/prisma/dev_init.sql を使う。
// 値はすべて文字列リテラルで出力するため、列の型が TEXT でも INTEGER でも投入できる。
// =============================================================================

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { readCsvObjects, sqlLiteral, quoteIdent } from './lib/csv.mjs';

const TABLE = 'resident_table';
const here = dirname(fileURLToPath(import.meta.url));
const csvPath = `${here}/../csv/resident_table.csv`;

const args = process.argv.slice(2);
const dialectIdx = args.indexOf('--dialect');
const dialect = dialectIdx >= 0 ? args[dialectIdx + 1] : 'postgres';
const truncate = args.includes('--truncate');

if (!['postgres', 'sqlite'].includes(dialect)) {
  console.error('--dialect には postgres か sqlite を指定してください。');
  process.exit(1);
}

const { header, records } = readCsvObjects(csvPath);
const colList = header.map(quoteIdent).join(', ');

const out = [];
out.push(`-- MADO sample-data (${dialect})`);
out.push('-- 完全架空の検証用データ。実在の住民情報は含まない。');
out.push(`-- 生成元: sample-data/csv/resident_table.csv（${records.length} 件 / ${header.length} 列）`);
out.push('');

if (dialect === 'postgres') {
  out.push('BEGIN;');
  if (truncate) out.push(`TRUNCATE TABLE ${quoteIdent(TABLE)};`);
} else {
  out.push('BEGIN TRANSACTION;');
  if (truncate) out.push(`DELETE FROM ${quoteIdent(TABLE)};`);
}
out.push('');

for (const r of records) {
  out.push(`INSERT INTO ${quoteIdent(TABLE)} (${colList}) VALUES (${header.map(h => sqlLiteral(r[h])).join(', ')});`);
}

out.push('');
out.push('COMMIT;');
out.push('');

// head などでパイプが閉じられたときに EPIPE で異常終了しないようにする
process.stdout.on('error', e => { if (e.code === 'EPIPE') process.exit(0); throw e; });
process.stdout.write(out.join('\n'));
