import { describe, it, expect } from 'vitest';
import { resolveSafeRedirect } from '@/lib/safeRedirect';

describe('resolveSafeRedirect', () => {
  it('同一オリジンの相対パスはそのまま返す', () => {
    expect(resolveSafeRedirect('/foo')).toBe('/foo');
  });

  it('null の場合は / にフォールバックする', () => {
    expect(resolveSafeRedirect(null)).toBe('/');
  });

  it('スキームレスプロトコル相対URL（//evil.com）は / にフォールバックする', () => {
    expect(resolveSafeRedirect('//evil.com')).toBe('/');
  });

  it('バックスラッシュを使った偽装（/\\evil.com）は / にフォールバックする', () => {
    expect(resolveSafeRedirect('/\\evil.com')).toBe('/');
  });

  it('絶対URL（http://evil.com）は / にフォールバックする', () => {
    expect(resolveSafeRedirect('http://evil.com')).toBe('/');
  });

  it('javascript: スキームは / にフォールバックする', () => {
    expect(resolveSafeRedirect('javascript:alert(1)')).toBe('/');
  });
});
