import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// SESSION_SECRET は各テストケースで差し替えるため、テストごとにモジュールキャッシュを
// クリアしてから動的 import で読み直す（getSecretKey() が process.env を参照するタイミングを
// テストごとに独立させるため）。
const VALID_SECRET = 'a'.repeat(32);
const originalSecret = process.env.SESSION_SECRET;

async function loadSessionModule() {
  return await import('@/lib/session');
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env.SESSION_SECRET;
  } else {
    process.env.SESSION_SECRET = originalSecret;
  }
  // 各テストで vi.useFakeTimers() を呼んだ場合に備え、実タイマーに戻しておく。
  vi.useRealTimers();
});

describe('createSessionToken / verifySessionToken', () => {
  it('往復で正しいペイロードが得られる（lgn には作成時刻が入る）', async () => {
    process.env.SESSION_SECRET = VALID_SECRET;
    const { createSessionToken, verifySessionToken } = await loadSessionModule();

    vi.useFakeTimers();
    const now = new Date('2026-01-01T00:00:00Z');
    vi.setSystemTime(now);
    const expectedLgn = Math.floor(now.getTime() / 1000);

    const payload = {
      sub: 'user-001',
      name: 'テスト太郎',
      department: '情報政策課',
      role: 'staff',
    };

    const token = await createSessionToken(payload);
    const result = await verifySessionToken(token);

    // createSessionToken は新規ログイン扱いのため、lgn には現在時刻がセットされる。
    expect(result).toEqual({ ...payload, lgn: expectedLgn });
  });

  it('payload に lgn が指定されていても無視し、常に現在時刻で上書きする', async () => {
    // 絶対期限（12時間）の起点を呼び出し側から操作できてしまうと、
    // 古い lgn を渡し続けることで絶対期限を回避できる。createSessionToken は
    // 新規ログイン専用なので、入力の lgn は必ず捨てなければならない。
    process.env.SESSION_SECRET = VALID_SECRET;
    const { createSessionToken, verifySessionToken } = await loadSessionModule();

    vi.useFakeTimers();
    const now = new Date('2026-02-01T00:00:00Z');
    vi.setSystemTime(now);
    const nowSec = Math.floor(now.getTime() / 1000);

    // 11時間前のログイン時刻を偽装して渡す（絶対期限まであと1時間の状態を作ろうとする）
    const forgedLgn = nowSec - 11 * 60 * 60;
    const token = await createSessionToken({
      sub: 'user-005',
      name: 'テスト五十郎',
      department: '住民課',
      role: 'staff',
      lgn: forgedLgn,
    });

    const result = await verifySessionToken(token);
    expect(result?.lgn).toBe(nowSec);
    expect(result?.lgn).not.toBe(forgedLgn);
  });

  it('改ざんされたトークンを渡すと null が返る', async () => {
    process.env.SESSION_SECRET = VALID_SECRET;
    const { createSessionToken, verifySessionToken } = await loadSessionModule();

    const payload = {
      sub: 'user-002',
      name: 'テスト花子',
      department: '住民課',
      role: 'admin',
    };
    const token = await createSessionToken(payload);

    // 署名部分の先頭1文字を書き換えて改ざんを再現する
    // （末尾の文字はbase64urlのパディングビットに当たり、値によっては
    //   デコード後のバイト列が変わらず改ざんが検出できないことがあるため避ける）
    const parts = token.split('.');
    const tamperedSignature =
      (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
    const tamperedToken = `${parts[0]}.${parts[1]}.${tamperedSignature}`;

    const result = await verifySessionToken(tamperedToken);
    expect(result).toBeNull();
  });

  it('不正な文字列を渡すと null が返る', async () => {
    process.env.SESSION_SECRET = VALID_SECRET;
    const { verifySessionToken } = await loadSessionModule();

    const result = await verifySessionToken('this-is-not-a-jwt');
    expect(result).toBeNull();
  });

  it('SESSION_SECRET が未設定の場合、createSessionToken は例外を投げる', async () => {
    delete process.env.SESSION_SECRET;
    const { createSessionToken } = await loadSessionModule();

    await expect(
      createSessionToken({
        sub: 'user-003',
        name: 'テスト三郎',
        department: '税務課',
        role: 'staff',
      })
    ).rejects.toThrow('SESSION_SECRET');
  });

  it('SESSION_SECRET が32文字未満の場合、createSessionToken は例外を投げる', async () => {
    process.env.SESSION_SECRET = 'short-secret';
    const { createSessionToken } = await loadSessionModule();

    await expect(
      createSessionToken({
        sub: 'user-004',
        name: 'テスト四郎',
        department: '福祉課',
        role: 'staff',
      })
    ).rejects.toThrow('SESSION_SECRET');
  });
});

describe('無操作期限（10分）', () => {
  it('無操作期限を過ぎたトークン（10分1秒後）は無効になる', async () => {
    process.env.SESSION_SECRET = VALID_SECRET;
    const { createSessionToken, verifySessionToken } = await loadSessionModule();

    vi.useFakeTimers();
    const start = new Date('2026-03-01T00:00:00Z');
    vi.setSystemTime(start);

    const token = await createSessionToken({
      sub: 'user-101',
      name: 'テスト一郎',
      department: '住民課',
      role: 'staff',
    });

    // 10分 + 1秒 経過
    vi.setSystemTime(new Date(start.getTime() + (10 * 60 + 1) * 1000));

    const result = await verifySessionToken(token);
    expect(result).toBeNull();
  });

  it('無操作期限内（9分後）なら有効', async () => {
    process.env.SESSION_SECRET = VALID_SECRET;
    const { createSessionToken, verifySessionToken } = await loadSessionModule();

    vi.useFakeTimers();
    const start = new Date('2026-03-01T00:00:00Z');
    vi.setSystemTime(start);

    const payload = {
      sub: 'user-102',
      name: 'テスト二郎',
      department: '住民課',
      role: 'staff',
    };
    const token = await createSessionToken(payload);

    // 9分経過（無操作期限10分以内）
    vi.setSystemTime(new Date(start.getTime() + 9 * 60 * 1000));

    const result = await verifySessionToken(token);
    expect(result).not.toBeNull();
    expect(result?.sub).toBe(payload.sub);
  });
});

describe('renewSessionToken（スライディング延長）', () => {
  it('lgn を保持したまま exp を更新する', async () => {
    process.env.SESSION_SECRET = VALID_SECRET;
    const { createSessionToken, verifySessionToken, renewSessionToken } =
      await loadSessionModule();

    vi.useFakeTimers();
    const start = new Date('2026-04-01T00:00:00Z');
    vi.setSystemTime(start);

    const payload = {
      sub: 'user-201',
      name: 'テスト五郎',
      department: '福祉課',
      role: 'staff',
    };
    const token = await createSessionToken(payload);
    const verified = await verifySessionToken(token);
    expect(verified).not.toBeNull();
    const originalLgn = verified!.lgn;

    // 5分後に延長（この時点ではまだ無操作期限内）
    vi.setSystemTime(new Date(start.getTime() + 5 * 60 * 1000));
    const renewedToken = await renewSessionToken(verified!);

    // 作成からは14分経過（延長しなければ無効になっている時刻）だが、
    // 延長により無操作期限が5分後起点で再カウントされているため有効なはず。
    vi.setSystemTime(new Date(start.getTime() + (5 * 60 + 9 * 60) * 1000));
    const renewedResult = await verifySessionToken(renewedToken);

    expect(renewedResult).not.toBeNull();
    expect(renewedResult?.lgn).toBe(originalLgn);
    expect(renewedResult?.sub).toBe(payload.sub);
  });

  it('lgn を含まない payload を渡すと例外を投げる（誤用防止）', async () => {
    process.env.SESSION_SECRET = VALID_SECRET;
    const { renewSessionToken } = await loadSessionModule();

    await expect(
      renewSessionToken({
        sub: 'user-202',
        name: 'テスト六郎',
        department: '税務課',
        role: 'staff',
        // lgn を意図的に付けない
      })
    ).rejects.toThrow('lgn');
  });

  it('延長を繰り返しても最初のログインから12時間を超えると無効になる', async () => {
    process.env.SESSION_SECRET = VALID_SECRET;
    const {
      createSessionToken,
      verifySessionToken,
      renewSessionToken,
      SESSION_MAX_AGE_SEC,
    } = await loadSessionModule();

    vi.useFakeTimers();
    const start = new Date('2026-05-01T00:00:00Z');
    vi.setSystemTime(start);

    const payload = {
      sub: 'user-203',
      name: 'テスト七郎',
      department: '情報政策課',
      role: 'admin',
    };

    let token = await createSessionToken(payload);

    // 無操作期限（10分）より短い9分おきに延長を繰り返す。
    const STEP_SEC = 9 * 60;
    let elapsedSec = 0;
    let crossedAbsoluteLimit = false;

    // SESSION_MAX_AGE_SEC(12時間) を確実に超えるまでループする。
    while (elapsedSec <= SESSION_MAX_AGE_SEC + STEP_SEC) {
      elapsedSec += STEP_SEC;
      vi.setSystemTime(new Date(start.getTime() + elapsedSec * 1000));

      const result = await verifySessionToken(token);

      if (elapsedSec > SESSION_MAX_AGE_SEC) {
        // 最初のログインから12時間を超えた回：延長を続けていても無効になるはず。
        expect(result).toBeNull();
        crossedAbsoluteLimit = true;
        break;
      }

      // まだ12時間以内：延長されていれば有効なので、次回のために再延長する。
      expect(result).not.toBeNull();
      token = await renewSessionToken(result!);
    }

    expect(crossedAbsoluteLimit).toBe(true);
  });
});

describe('旧形式トークンの扱い', () => {
  it('lgn クレームを持たない旧形式のトークンは無効になる（意図的な仕様変更）', async () => {
    // このスライディング延長方式の導入前に発行されたトークンには lgn が存在しない。
    // 絶対期限の起点が分からないため、安全側に倒して無条件で無効にする。
    // 導入時に全職員が1回だけ再ログインを求められる形になるが、
    // 閉域網内の庁内ツールであるため許容する運用判断（要件定義より）。
    process.env.SESSION_SECRET = VALID_SECRET;
    const { verifySessionToken, SESSION_IDLE_MAX_AGE_SEC } = await loadSessionModule();
    const { SignJWT } = await import('jose');

    const secretKey = new TextEncoder().encode(VALID_SECRET);
    const legacyToken = await new SignJWT({
      name: 'テスト八郎',
      department: '住民課',
      role: 'staff',
      // lgn を含めない
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-legacy')
      .setIssuedAt()
      .setExpirationTime(`${SESSION_IDLE_MAX_AGE_SEC}s`)
      .sign(secretKey);

    const result = await verifySessionToken(legacyToken);
    expect(result).toBeNull();
  });
});
