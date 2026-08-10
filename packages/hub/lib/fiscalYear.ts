// 日本の年度（4月1日〜翌年3月31日）計算
//
// 権限の既定期限を「年度末3月31日」に揃えるためのユーティリティ。
// 人事異動のタイミング（4月）で必ず権限見直しが発生するようにするのが目的。

/**
 * from が属する年度の年度末（3月31日 23:59:59.999、ローカル時刻）を返す。
 *
 * - 4月〜12月 → 翌年の3月31日
 * - 1月〜3月 → 同年の3月31日
 *
 * 時刻をその日の終わりにしているのは、0時0分にすると3月31日当日に
 * 権限が失効してしまい、年度末当日の業務に支障が出るため。
 *
 * @param from 基準日時（省略時は現在時刻）
 */
export function nextFiscalYearEnd(from: Date = new Date()): Date {
  const year = from.getFullYear();
  const month = from.getMonth(); // 0-11 (0=1月)

  // 4月(month index 3)〜12月(month index 11) なら翌年3月31日、
  // 1月〜3月(month index 0-2) なら同年3月31日。
  const endYear = month >= 3 ? year + 1 : year;

  return new Date(endYear, 2, 31, 23, 59, 59, 999);
}
