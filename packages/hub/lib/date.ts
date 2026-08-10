export function calcAge(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.replace(/\//g, '-').split('-').map(Number);
  if (!y || !m || !d) return '';
  const today = new Date();
  let age = today.getFullYear() - y;
  if (
    today.getMonth() + 1 < m ||
    (today.getMonth() + 1 === m && today.getDate() < d)
  ) age--;
  return `${age}歳`;
}

// 和暦入力の先頭1桁（元号コード）→ 西暦ベース年。base + 元号年 = 西暦年
const ERA_TABLE: Record<string, number> = {
  '1': 1867, // 明治
  '2': 1911, // 大正
  '3': 1925, // 昭和
  '4': 1988, // 平成
  '5': 2018, // 令和
};

/**
 * 検索入力値を自動判定してDBクエリ用パラメータに変換する。
 * 7桁 & <8000000 → 和暦 → birthdate検索
 * 8桁 & 19000101-20399999 → 西暦 → birthdate検索
 * それ以外の数値 → 宛名番号検索
 */
export function parseSearchInput(input: string):
  | { type: 'birthdate'; date: string }
  | { type: 'code'; code: number }
  | null {
  const trimmed = input.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) return null;

  const num = parseInt(trimmed, 10);

  // 7桁 かつ 8000000未満 → 和暦
  if (trimmed.length === 7 && num < 8000000) {
    const eraCode = trimmed.charAt(0);
    const year = parseInt(trimmed.slice(1, 3), 10);
    const month = parseInt(trimmed.slice(3, 5), 10);
    const day = parseInt(trimmed.slice(5, 7), 10);
    const base = ERA_TABLE[eraCode];
    if (!base || isNaN(year) || isNaN(month) || isNaN(day)) return null;
    const fullYear = base + year;
    const date = `${fullYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { type: 'birthdate', date };
  }

  // 8桁 かつ 19000101-20399999 → 西暦
  if (trimmed.length === 8 && num >= 19000101 && num <= 20399999) {
    const year = trimmed.slice(0, 4);
    const month = trimmed.slice(4, 6);
    const day = trimmed.slice(6, 8);
    return { type: 'birthdate', date: `${year}-${month}-${day}` };
  }

  // それ以外 → 宛名番号
  return { type: 'code', code: num };
}

function parseYMD(dateStr: string): [number, number, number] | null {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const [y, m, d] = parts.map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return [y, m, d];
}

/** YYYY-MM-DD → 和暦短縮表示（例: 平 5. 2.15） */
export function toWareki(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const ymd = parseYMD(dateStr);
  if (!ymd) return dateStr;
  const [y, m, d] = ymd;

  let era: string;
  let eraYear: number;
  if (y >= 2019) { era = '令'; eraYear = y - 2018; }
  else if (y >= 1989) { era = '平'; eraYear = y - 1988; }
  else if (y >= 1926) { era = '昭'; eraYear = y - 1925; }
  else if (y >= 1912) { era = '大'; eraYear = y - 1911; }
  else { era = '明'; eraYear = y - 1867; }

  const yStr = eraYear === 1 ? '元' : String(eraYear).padStart(2, ' ');
  const mStr = String(m).padStart(2, ' ');
  const dStr = String(d).padStart(2, ' ');
  return `${era}${yStr}.${mStr}.${dStr}`;
}

/** YYYY-MM-DD → 和暦フル表示（例: 平成5年02月15日） */
export function toJapaneseEra(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const ymd = parseYMD(dateStr);
  if (!ymd) return dateStr;
  const [y, m, d] = ymd;

  const dateInt = y * 10000 + m * 100 + d;
  let era: string;
  let eraYear: number;
  if (dateInt >= 20190501) { era = '令和'; eraYear = y - 2018; }
  else if (dateInt >= 19890108) { era = '平成'; eraYear = y - 1988; }
  else if (dateInt >= 19261225) { era = '昭和'; eraYear = y - 1925; }
  else if (dateInt >= 19120730) { era = '大正'; eraYear = y - 1911; }
  else { era = '明治'; eraYear = y - 1867; }

  const yStr = eraYear === 1 ? '元' : String(eraYear).padStart(2, '0');
  return `${era}${yStr}年${String(m).padStart(2, '0')}月${String(d).padStart(2, '0')}日`;
}
