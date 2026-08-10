import { describe, it, expect } from 'vitest';
import { filterAllowedFields, type ColumnDependencyMap } from '@/lib/columnDependencies';

const DEPENDENCIES: ColumnDependencyMap = {
  '氏名': ['氏名'],
  '本籍住所＋番地': ['本籍_町字', '本籍_地番号または、街区符号'],
};

describe('filterAllowedFields', () => {
  it('単一列に依存する項目は、その列が許可されていれば残る', () => {
    const result = filterAllowedFields({ '氏名': '山田太郎' }, DEPENDENCIES, new Set(['氏名']));
    expect(result).toEqual({ '氏名': '山田太郎' });
  });

  it('単一列に依存する項目は、その列が許可されていなければ除外される', () => {
    const result = filterAllowedFields({ '氏名': '山田太郎' }, DEPENDENCIES, new Set());
    expect(result).toEqual({});
  });

  it('複数列の連結項目は、いずれか一方でも未許可なら除外される', () => {
    const result = filterAllowedFields(
      { '本籍住所＋番地': '徳島県北島町1-2' },
      DEPENDENCIES,
      new Set(['本籍_町字']) // 片方だけ許可
    );
    expect(result).toEqual({});
  });

  it('複数列の連結項目は、すべて許可されていれば残る', () => {
    const result = filterAllowedFields(
      { '本籍住所＋番地': '徳島県北島町1-2' },
      DEPENDENCIES,
      new Set(['本籍_町字', '本籍_地番号または、街区符号'])
    );
    expect(result).toEqual({ '本籍住所＋番地': '徳島県北島町1-2' });
  });

  it('依存関係が定義されていないキーは常に除外される（設定漏れを黙って見逃さない）', () => {
    const result = filterAllowedFields(
      { '未定義キー': 'x' },
      DEPENDENCIES,
      new Set(['未定義キー'])
    );
    expect(result).toEqual({});
  });
});
