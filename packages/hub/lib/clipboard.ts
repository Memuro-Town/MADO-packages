// クリップボードコピー（非secure context対応）
//
// navigator.clipboard は secure context（https:// または localhost）でしか
// 使えない。本番はオフラインLANの http://<IP>:3010 で配信するため、
// 他PCのブラウザでは navigator.clipboard が undefined になる。
// その場合は旧来の document.execCommand('copy') にフォールバックする。
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 権限拒否などでも下のフォールバックを試す
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}
