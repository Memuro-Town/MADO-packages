#!/usr/bin/env node
// 認証ユーザー無効化CLI（isActive を false に更新する。行削除はしない）
// 使い方: node scripts/disable-user.mjs <loginId>
import { PrismaClient, Prisma } from '@prisma/client';

async function main() {
  const [loginId] = process.argv.slice(2);

  if (!loginId) {
    console.error('使い方: node scripts/disable-user.mjs <loginId>');
    process.exit(1);
  }

  const db = new PrismaClient();
  try {
    const user = await db.user.update({
      where: { loginId },
      data: { isActive: false },
    });
    console.log(`無効化しました: ${user.loginId}（${user.name} / ${user.department}）`);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      console.error(`エラー: ログインID "${loginId}" のユーザーは存在しません`);
    } else {
      console.error('エラー: ユーザー無効化に失敗しました');
      console.error(e);
    }
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

main();
