#!/usr/bin/env node
// 既存ユーザー全員に resident_basic グループの grant を付与する移行スクリプト（Phase 1）
// 使い方: node scripts/migrate-grants.mjs
//
// 冪等: すでに有効な resident_basic の grant を持つユーザーはスキップする。
// 何回実行しても重複した grant は作られない。
//
// 注意: このスクリプトは指揮側が確認の上で実行する。ここでは作成のみ。
import { PrismaClient } from '@prisma/client';

const GROUP_ID = 'resident_basic';
const GRANTED_BY = 'migration';
const REASON = '既存ユーザーの移行（Phase 1）';

// lib/fiscalYear.ts の nextFiscalYearEnd() と同じロジック。
// このスクリプトは素の node で実行するため（他のCLIスクリプト群と同様、
// TypeScriptモジュールをクロスインポートしない方針）、ここに複製している。
// ロジックを変更する場合は lib/fiscalYear.ts 側と揃えること。
function nextFiscalYearEnd(from = new Date()) {
  const year = from.getFullYear();
  const month = from.getMonth(); // 0-11 (0=1月)
  const endYear = month >= 3 ? year + 1 : year;
  return new Date(endYear, 2, 31, 23, 59, 59, 999);
}

async function main() {
  const db = new PrismaClient();
  try {
    const now = new Date();
    const users = await db.user.findMany();

    let grantedCount = 0;
    let skippedCount = 0;

    for (const user of users) {
      const existing = await db.permissionGrant.findFirst({
        where: {
          userId: user.id,
          groupId: GROUP_ID,
          revokedAt: null,
          expiresAt: { gt: now },
        },
      });

      if (existing) {
        console.log(`スキップ: ${user.loginId}（有効な ${GROUP_ID} の grant が既に存在します）`);
        skippedCount++;
        continue;
      }

      await db.permissionGrant.create({
        data: {
          userId: user.id,
          groupId: GROUP_ID,
          expiresAt: nextFiscalYearEnd(now),
          grantedBy: GRANTED_BY,
          reason: REASON,
        },
      });
      console.log(`付与しました: ${user.loginId}（${GROUP_ID}）`);
      grantedCount++;
    }

    console.log('---');
    console.log(`付与: ${grantedCount}件 / スキップ: ${skippedCount}件（対象ユーザー総数: ${users.length}件）`);
  } catch (e) {
    console.error('エラー: 移行に失敗しました');
    console.error(e);
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

main();
