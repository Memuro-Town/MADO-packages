#!/usr/bin/env node
// =============================================================================
// 生成済みの sample-data を検査する。
//
//   node sample-data/scripts/verify-sample-data.mjs
//
// 「架空データであること」をコミット済みファイル側で機械的に確認するためのもの。
// レビュー時・CI で実行できる。エラーがあれば終了コード 1 を返す。
// =============================================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { readCsvObjects } from './lib/csv.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const csvPath = `${here}/../csv/resident_table.csv`;
const jsonPath = `${here}/../prisma/resident_table.seed.json`;
const ddlPath = `${here}/../../packages/hub/prisma/dev_init.sql`;

const MUNI_CODE = '999999';
const OTHER_MUNI_CODE = '999998';
const 団体コード列 = [
  '市区町村コード', '住所_市区町村コード', '本籍_市区町村コード',
  '転入前住所_市区町村コード', '転出先住所（確定）_市区町村コード',
];

const errors = [];
const warnings = [];
function check(cond, message) { if (!cond) errors.push(message); }

// --- CSV ---------------------------------------------------------------------
const raw = readFileSync(csvPath);
check(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf,
  'csv/resident_table.csv が BOM 付き UTF-8 ではない（Excel での文字化け防止のため BOM を付けている）');
check(!raw.includes(0x0d), 'csv/resident_table.csv に CR が含まれている（改行は LF に統一する）');

const { header, records } = readCsvObjects(csvPath);

// 1. 個人番号を持たないこと（Memuro-Town/MADO Issue #4 の合意事項）
for (const h of header) {
  check(h !== '個人番号' && !h.includes('マイナンバー'),
    `個人番号に相当するカラムが含まれている: ${h}`);
}

// 2. 意図的に値を持たせない項目が空であること
for (const h of ['基礎年金番号', '在留カード等番号']) {
  if (!header.includes(h)) continue;
  const filled = records.filter(r => r[h] !== '');
  check(filled.length === 0, `${h} に値が入っている（このデータセットでは意図的に空にしている）`);
}

// 3. 団体コードが架空値のみであること
for (const r of records) {
  for (const col of 団体コード列) {
    const v = r[col];
    if (!v) continue;
    check(v === MUNI_CODE || v === OTHER_MUNI_CODE,
      `宛名番号 ${r['宛名番号']}: ${col} が架空の団体コード(${MUNI_CODE}/${OTHER_MUNI_CODE})ではない: ${v}`);
  }
  check(r['住所_都道府県'] === 'サンプル県', `宛名番号 ${r['宛名番号']}: 住所_都道府県 が サンプル県 ではない`);
  check(r['住所_市区郡町村名'] === 'サンプル市', `宛名番号 ${r['宛名番号']}: 住所_市区郡町村名 が サンプル市 ではない`);
}

// 4. 宛名番号の一意性と世帯の整合性
const ids = new Set();
const byHousehold = new Map();
for (const r of records) {
  check(!ids.has(r['宛名番号']), `宛名番号が重複している: ${r['宛名番号']}`);
  ids.add(r['宛名番号']);
  if (!byHousehold.has(r['世帯番号'])) byHousehold.set(r['世帯番号'], []);
  byHousehold.get(r['世帯番号']).push(r);
}
for (const [hcode, members] of byHousehold) {
  const heads = members.filter(r => r['続柄コード1'] === '2');
  check(heads.length === 1, `世帯 ${hcode}: 世帯主(続柄コード1=2)が ${heads.length} 人`);
  if (heads.length === 1) {
    check(members.every(r => r['世帯主氏名'] === heads[0]['氏名']),
      `世帯 ${hcode}: 世帯主氏名 が世帯主の氏名と一致しない`);
  }
  const orders = members.map(r => Number(r['記載順位'])).sort((a, b) => a - b);
  check(orders.every((v, i) => v === i + 1), `世帯 ${hcode}: 記載順位が 1 からの連番になっていない`);
}

// --- prisma seed JSON --------------------------------------------------------
const jsonRows = JSON.parse(readFileSync(jsonPath, 'utf8'));
check(jsonRows.length === records.length,
  `prisma/resident_table.seed.json の件数(${jsonRows.length})が CSV(${records.length})と一致しない`);
for (const [i, o] of jsonRows.entries()) {
  const keys = Object.keys(o);
  check(keys.length === header.length,
    `prisma seed ${i + 1} 件目: 列数(${keys.length})が CSV の見出し(${header.length})と一致しない`);
  check(!keys.includes('個人番号'), `prisma seed ${i + 1} 件目: 個人番号カラムが含まれている`);
}

// --- hub の DDL との照合（別パッケージの状態に依存するため警告扱い） ------------
try {
  const ddl = readFileSync(ddlPath, 'utf8');
  const ddlCols = [...ddl.matchAll(/^\s{2}"([^"]+)"/gm)].map(m => m[1]);
  if (ddlCols.length > 0) {
    const missing = ddlCols.filter(c => !header.includes(c));
    const extra = header.filter(c => !ddlCols.includes(c));
    if (missing.length) warnings.push(`hub の dev_init.sql にあって CSV にない列: ${missing.join(', ')}`);
    if (extra.length) warnings.push(`CSV にあって hub の dev_init.sql にない列: ${extra.join(', ')}`);
    if (!missing.length && !extra.length) {
      console.log(`packages/hub/prisma/dev_init.sql と列構成が一致（${ddlCols.length} 列）`);
    }
  }
} catch {
  warnings.push('packages/hub/prisma/dev_init.sql を読めなかったため、列構成の照合をスキップした');
}

// --- 結果 --------------------------------------------------------------------
for (const w of warnings) console.warn('WARN: ' + w);
if (errors.length > 0) {
  console.error(`NG: ${errors.length} 件の問題があります`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log(`OK: 世帯 ${byHousehold.size} 件 / 住民 ${records.length} 件 / ${header.length} 列。個人番号カラムなし。`);
