import { describe, it, expect, afterEach } from 'vitest';
import { PERMISSION_GROUPS, expandGroupColumns } from '@/lib/permissionGroups';

// テスト用に追加した仮グループのIDを記録し、各テスト後に必ず取り除く
const testGroupIds: string[] = [];

function addTestGroup(group: (typeof PERMISSION_GROUPS)[string]) {
  PERMISSION_GROUPS[group.id] = group;
  testGroupIds.push(group.id);
}

afterEach(() => {
  while (testGroupIds.length > 0) {
    const id = testGroupIds.pop()!;
    delete PERMISSION_GROUPS[id];
  }
});

describe('expandGroupColumns', () => {
  it('resident_basic の展開結果が期待通りである', () => {
    const columns = expandGroupColumns('resident_basic');
    expect(columns.has('宛名番号')).toBe(true);
    expect(columns.has('氏名')).toBe(true);
    expect(columns.has('本籍')).toBe(true);
    expect(columns.has('戸籍_筆頭者')).toBe(true);
    expect(columns.has('存在しないダミー列名')).toBe(false);
  });

  it('階層構造（basedOn）が正しく展開される', () => {
    addTestGroup({
      id: 'test_base',
      label: 'テスト基本グループ',
      table: 'resident_table',
      addsColumns: ['列A', '列B'],
    });
    addTestGroup({
      id: 'test_child',
      label: 'テスト拡張グループ',
      table: 'resident_table',
      basedOn: 'test_base',
      addsColumns: ['列C'],
    });

    const columns = expandGroupColumns('test_child');
    expect(columns).toEqual(new Set(['列A', '列B', '列C']));
  });

  it('2段階以上の階層構造も正しく展開される', () => {
    addTestGroup({
      id: 'test_level1',
      label: 'レベル1',
      table: 'resident_table',
      addsColumns: ['列1'],
    });
    addTestGroup({
      id: 'test_level2',
      label: 'レベル2',
      table: 'resident_table',
      basedOn: 'test_level1',
      addsColumns: ['列2'],
    });
    addTestGroup({
      id: 'test_level3',
      label: 'レベル3',
      table: 'resident_table',
      basedOn: 'test_level2',
      addsColumns: ['列3'],
    });

    const columns = expandGroupColumns('test_level3');
    expect(columns).toEqual(new Set(['列1', '列2', '列3']));
  });

  it('循環参照があるとエラーを投げる', () => {
    addTestGroup({
      id: 'test_cycle_a',
      label: '循環A',
      table: 'resident_table',
      basedOn: 'test_cycle_b',
      addsColumns: ['列A'],
    });
    addTestGroup({
      id: 'test_cycle_b',
      label: '循環B',
      table: 'resident_table',
      basedOn: 'test_cycle_a',
      addsColumns: ['列B'],
    });

    expect(() => expandGroupColumns('test_cycle_a')).toThrow();
  });

  it('存在しないグループIDを指定するとエラーを投げる', () => {
    expect(() => expandGroupColumns('存在しないグループID')).toThrow();
  });

  it('存在しない basedOn を指定されたグループもエラーを投げる', () => {
    addTestGroup({
      id: 'test_broken',
      label: '壊れたグループ',
      table: 'resident_table',
      basedOn: '存在しない土台グループ',
      addsColumns: ['列X'],
    });

    expect(() => expandGroupColumns('test_broken')).toThrow();
  });
});
