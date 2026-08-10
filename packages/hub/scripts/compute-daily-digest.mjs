#!/usr/bin/env node
// 監査ログ（audit_log）の日次ダイジェスト計算バッチ。
// 使い方: node scripts/compute-daily-digest.mjs [YYYY-MM-DD]
//   引数を省略すると「昨日」（実行時点のローカル日付から1日前）を対象にする。
//   夜間、その日の業務が終わったあとに実行する想定。
//
// 冪等: 既にそのdateのdaily_digestが存在する場合、再計算して一致するか確認するだけで
// 上書きはしない（一致すれば何もせず終了、不一致なら改ざんの疑いとしてエラー終了する）。
//
// 前日分のdaily_digestが無い場合、audit_logにそれより前のデータが存在するなら
// 「チェーンに欠けがある」ためエラー終了する（黙って起点をずらさない）。
// audit_logにそれより前のデータが無ければ、そこが本当の初日なのでGENESIS値を使う。
//
// lib/auditDigest.ts と同じロジックをここに複製している（他のCLIスクリプト群と同様、
// TypeScriptモジュールをクロスインポートしない方針のため）。
// ⚠️ ロジックを変更する場合は lib/auditDigest.ts 側と完全に揃えること。
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const GENESIS_DIGEST = 'MADO-hub-audit-log-genesis-v1';

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  const entries = keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${entries.join(',')}}`;
}

function canonicalizeLogRow(row) {
  return stableStringify({
    id: row.id,
    at: row.at.toISOString(),
    actorLogin: row.actorLogin,
    actorName: row.actorName,
    actorDept: row.actorDept,
    action: row.action,
    targetAtenaCode: row.targetAtenaCode,
    detail: row.detail,
    ip: row.ip,
    userAgent: row.userAgent,
  });
}

function computeDailyDigest(previousDigest, rows) {
  const canonicalRows = rows.map(canonicalizeLogRow).join('\n');
  const input = `${previousDigest ?? GENESIS_DIGEST}\n${canonicalRows}`;
  return crypto.createHash('sha256').update(input, 'utf-8').digest('hex');
}

function parseDateArg(arg) {
  if (!arg) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    return yesterday;
  }
  const d = new Date(`${arg}T00:00:00`);
  if (isNaN(d.getTime())) return null;
  return d;
}

// dayStart/dayEnd/previousDay は audit_log.at（実時刻）を絞り込むためのローカル日境界。
// これらは JS の Date オブジェクトとして正しく機能する（Prismaが内部でUTC瞬間に変換して
// 比較するため、範囲検索としては問題ない）。
function toLocalDateOnly(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// daily_digests.date（@db.Date、時刻を持たない）に書き込む・で検索する値は、
// こことは別に「意図したカレンダー日そのものをUTC真夜中として表現したDate」を使う。
// toLocalDateOnly()で作ったDate（ローカル真夜中）をそのまま渡すと、Prismaが
// UTCのカレンダー日に変換する際に1日ズレる（JSTはUTC+9なので、ローカル真夜中は
// UTCでは前日15時になり、「日付」だけを取り出すと前日になってしまう）。
function toUtcDateOnly(d) {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

// 画面・ログ表示用のラベルもローカルの年月日で組み立てる（toISOString().slice(0,10)は
// UTC変換されるため、上記と同じ理由で使わない）。
function formatLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function main() {
  const targetDate = parseDateArg(process.argv[2]);
  if (!targetDate) {
    console.error('エラー: 日付はYYYY-MM-DD形式で指定してください');
    process.exit(1);
  }

  const dayStart = toLocalDateOnly(targetDate);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const previousDay = new Date(dayStart);
  previousDay.setDate(previousDay.getDate() - 1);

  const dateLabel = formatLocalDate(dayStart);
  const previousDayLabel = formatLocalDate(previousDay);
  console.log(`対象日: ${dateLabel}`);

  const db = new PrismaClient();
  try {
    const [existingForTarget, previousDigestRow, earliestLog] = await Promise.all([
      db.dailyDigest.findUnique({ where: { date: toUtcDateOnly(dayStart) } }),
      db.dailyDigest.findUnique({ where: { date: toUtcDateOnly(previousDay) } }),
      db.auditLog.findFirst({ orderBy: { at: 'asc' } }),
    ]);

    let previousDigest;
    if (previousDigestRow) {
      previousDigest = previousDigestRow.digest;
      console.log(`前日（${previousDayLabel}）のダイジェストを使用します。`);
    } else if (!earliestLog || earliestLog.at >= dayStart) {
      previousDigest = null;
      console.log('audit_logにこれより前のデータが無いため、起点（GENESIS）として計算します。');
    } else {
      console.error(
        `エラー: 前日（${previousDayLabel}）のダイジェストが見つかりません。` +
        'それより前のaudit_logデータは存在するため、チェーンに欠けがあります。' +
        '前日以前を先に計算してください。'
      );
      process.exitCode = 1;
      return;
    }

    const rows = await db.auditLog.findMany({
      where: { at: { gte: dayStart, lt: dayEnd } },
      orderBy: { id: 'asc' },
    });

    const digest = computeDailyDigest(previousDigest, rows);

    if (existingForTarget) {
      if (existingForTarget.digest === digest) {
        console.log(`既に計算済みで、再計算結果と一致しました（${rows.length}件）。何もしません。`);
        return;
      }
      console.error('★★★ 警告：既存のダイジェストと再計算結果が一致しません ★★★');
      console.error(`保存済み: ${existingForTarget.digest}`);
      console.error(`再計算  : ${digest}`);
      console.error('audit_logの過去データが変更された可能性があります。上書きはしません。調査してください。');
      process.exitCode = 1;
      return;
    }

    await db.dailyDigest.create({
      data: {
        date: toUtcDateOnly(dayStart),
        digest,
        previousDigest,
        rowCount: rows.length,
      },
    });
    console.log(`計算しました: ${dateLabel}（${rows.length}件） -> ${digest}`);
  } catch (e) {
    console.error('エラー: ダイジェスト計算に失敗しました');
    console.error(e);
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

main();
