// 権限グループ定義
//
// グループはコード内の定数として持ち、DBに置かない・管理画面から編集させない。
// グループ変更は全員の権限を一斉に変える重い操作なので、コード変更として
// 庁内の決裁フロー（PRレビュー・課長承認）を通す必要がある。
// 編集画面を作らないこと自体が安全装置になっている。

export interface PermissionGroup {
  id: string;
  label: string; // 画面表示用の日本語ラベル
  table: string; // 対象テーブル（将来テーブルが増えても構造を変えずに済むよう持たせる）
  basedOn?: string; // 土台にするグループのid（階層構造）
  addsColumns: string[]; // このグループが土台に追加する列
}

// 基本グループの許可列。lib/columnAccess.ts の DEFAULT_ALLOWED_COLUMNS と
// 同一内容（本籍・戸籍筆頭者を含む）。
// hubは住基照会画面を使える職員が同じ情報を効率よく扱うためのツールであり、
// 新たな情報アクセスを生んでいないため、これは意図的な決定である。
// 2026-09-30: CSV取込列を絞ったあとの resident_table 実列に合わせる
const RESIDENT_BASIC_COLUMNS = [
  '宛名番号', '世帯番号', '住民種別', '住民状態', '住民票コード',
  '氏名', '氏_日本人', '名_日本人', '氏名_外国人ローマ字', '氏名_外国人漢字',
  '氏名_振り仮名（フリガナ）', '氏_日本人_振り仮名', '名_日本人_振り仮名', '氏名_氏名のカタカナ表記',
  '性別', '性別表記', '生年月日_元号', '生年月日',
  '続柄コード1', '続柄表記', '世帯主氏名',
  '住所_町字コード', '住所_町字', '住所_番地号表記', '住所_番地枝番数値', '住所_方書', '住所_郵便番号',
  '住所を定めた年月日',
  '本籍', '本籍_地番号または、街区符号', '戸籍_筆頭者',
  '地区管理コード1', '記載順位', '基礎年金番号',
];

export const PERMISSION_GROUPS: Record<string, PermissionGroup> = {
  resident_basic: {
    id: 'resident_basic',
    label: '基本グループ（住民基本情報）',
    table: 'resident_table',
    addsColumns: RESIDENT_BASIC_COLUMNS,
  },
};

/**
 * basedOn を再帰的に展開して、そのグループで見られる全列を返す。
 *
 * 存在しないグループID・循環参照はエラーとする。
 */
export function expandGroupColumns(groupId: string): Set<string> {
  return expandGroupColumnsInternal(groupId, []);
}

function expandGroupColumnsInternal(groupId: string, visiting: string[]): Set<string> {
  if (visiting.includes(groupId)) {
    throw new Error(
      `権限グループの basedOn が循環参照しています: ${[...visiting, groupId].join(' -> ')}`
    );
  }

  const group = PERMISSION_GROUPS[groupId];
  if (!group) {
    throw new Error(`存在しない権限グループIDです: ${groupId}`);
  }

  const nextVisiting = [...visiting, groupId];
  const columns = new Set<string>();

  if (group.basedOn) {
    const baseColumns = expandGroupColumnsInternal(group.basedOn, nextVisiting);
    for (const col of baseColumns) columns.add(col);
  }

  for (const col of group.addsColumns) columns.add(col);

  return columns;
}
