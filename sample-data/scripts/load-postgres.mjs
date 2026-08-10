#!/usr/bin/env node
// =============================================================================
// sample-data/csv/resident_table.csv を PostgreSQL の resident_table に投入する。
//
// hub は PostgreSQL へ移行済みのため、これが標準の投入経路。
//
//   # packages/hub から実行する（@prisma/client と DATABASE_URL を解決するため）
//   cd packages/hub
//   node ../../sample-data/scripts/load-postgres.mjs            # 追加投入
//   node ../../sample-data/scripts/load-postgres.mjs --truncate # 既存行を消してから投入
//   node ../../sample-data/scripts/load-postgres.mjs --dry-run  # SQLを表示するだけ
//
// 注意: --truncate は resident_table の全行を削除する。
//       実データの入った環境では絶対に実行しないこと。
// =============================================================================

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';
import { readCsvObjects, sqlLiteral, quoteIdent } from './lib/csv.mjs';

const TABLE = 'resident_table';
const here = dirname(fileURLToPath(import.meta.url));
const csvPath = `${here}/../csv/resident_table.csv`;

const args = process.argv.slice(2);
const truncate = args.includes('--truncate');
const dryRun = args.includes('--dry-run');

const { header, records } = readCsvObjects(csvPath);
if (records.length === 0) {
  console.error('CSV にレコードがありません。先に generate-sample-data.mjs を実行してください。');
  process.exit(1);
}

const colList = header.map(quoteIdent).join(', ');
const statements = records.map(r =>
  `INSERT INTO ${quoteIdent(TABLE)} (${colList}) VALUES (${header.map(h => sqlLiteral(r[h])).join(', ')})`
);

if (dryRun) {
  if (truncate) console.log(`TRUNCATE TABLE ${quoteIdent(TABLE)};`);
  for (const s of statements) console.log(s + ';');
  process.exit(0);
}

// このファイル自身は sample-data/scripts/ にあるため、素の import('@prisma/client') は
// このファイルの場所を起点に node_modules を探してしまい、packages/hub/node_modules を見つけられない。
// カレントディレクトリ（packages/hub で実行する想定）を起点に解決し直す。
let PrismaClient;
try {
  const cwdRequire = createRequire(pathToFileURL(`${process.cwd()}/`).href);
  const resolved = cwdRequire.resolve('@prisma/client');
  ({ PrismaClient } = await import(pathToFileURL(resolved).href));
} catch {
  console.error(
    '@prisma/client を読み込めませんでした。\n' +
    'packages/hub で `npm install && npx prisma generate` を実行したうえで、\n' +
    'packages/hub をカレントディレクトリにして再実行してください。\n' +
    '  cd packages/hub && node ../../sample-data/scripts/load-postgres.mjs'
  );
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  await prisma.$transaction(async tx => {
    if (truncate) {
      await tx.$executeRawUnsafe(`TRUNCATE TABLE ${quoteIdent(TABLE)}`);
      console.log(`${TABLE} を空にしました。`);
    }
    for (const s of statements) {
      await tx.$executeRawUnsafe(s);
    }
  });
  console.log(`OK: ${records.length} 件を ${TABLE} に投入しました。`);
} catch (e) {
  console.error('投入に失敗しました:', e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
