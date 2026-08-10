#!/usr/bin/env node
// 認証ユーザー登録CLI
// 使い方: node scripts/create-user.mjs <loginId> <氏名> <部署> [role]
//   role: "admin" または "staff"（省略時 "staff"）
// パスワードは標準入力から非表示で2回入力する。
import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import readline from 'node:readline';

const BCRYPT_COST = 10;
const MIN_PASSWORD_LENGTH = 8;
const VALID_ROLES = ['admin', 'staff'];

/** パスワードを非表示（エコーなし）で1回入力させる */
function askHidden(prompt) {
  return new Promise(resolve => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    let muted = false;
    const origWrite = rl._writeToOutput.bind(rl);
    rl._writeToOutput = str => {
      if (!muted) origWrite(str);
    };
    rl.question(prompt, answer => {
      muted = false;
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true; // プロンプト表示後に入力エコーを止める
  });
}

async function main() {
  const [loginId, name, department, role = 'staff'] = process.argv.slice(2);

  if (!loginId || !name || !department) {
    console.error('使い方: node scripts/create-user.mjs <loginId> <氏名> <部署> [role]');
    console.error('  role: "admin" または "staff"（省略時 "staff"）');
    process.exit(1);
  }
  if (!VALID_ROLES.includes(role)) {
    console.error(`エラー: role は "admin" か "staff" を指定してください（指定値: ${role}）`);
    process.exit(1);
  }

  const password = await askHidden('パスワード: ');
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`エラー: パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください`);
    process.exit(1);
  }
  const confirm = await askHidden('パスワード（確認）: ');
  if (password !== confirm) {
    console.error('エラー: パスワードが一致しません。最初からやり直してください');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const db = new PrismaClient();
  try {
    const user = await db.user.create({
      data: { loginId, name, department, role, passwordHash },
    });
    console.log(`登録しました: ${user.loginId}（${user.name} / ${user.department} / ${user.role}）`);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      console.error(`エラー: ログインID "${loginId}" は既に登録されています`);
    } else {
      console.error('エラー: ユーザー登録に失敗しました');
      console.error(e);
    }
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

main();
