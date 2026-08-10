// 出力項目（APIレスポンスのキー）が、実DBの複数列から組み立てられているケースがある
// （例: 「本籍住所＋番地」は2列の連結、「筆頭者」は氏＋名の連結）。
// 権限チェックは実DB列単位で行うため、「出力項目 → 必要なDB列」の対応表を介して、
// 必要な列のいずれか1つでも許可されていない出力項目はレスポンスから除外する。
export type ColumnDependencyMap = Record<string, string[]>;

/**
 * row のキーのうち、dependencies に定義された必要列がすべて allowed に含まれるものだけを残す。
 * dependencies に定義のないキーは（設定漏れを黙って見逃さないよう）常に除外する。
 */
export function filterAllowedFields<T extends Record<string, unknown>>(
  row: T,
  dependencies: ColumnDependencyMap,
  allowed: Set<string>
): Partial<T> {
  const result: Partial<T> = {};
  for (const key of Object.keys(row)) {
    const requiredColumns = dependencies[key];
    if (requiredColumns && requiredColumns.every(col => allowed.has(col))) {
      result[key as keyof T] = row[key as keyof T];
    }
  }
  return result;
}
