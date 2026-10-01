'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirm } from './useConfirm';

/**
 * ログイン画面に出す案内
 * - link_error: 認証コールバック・代理ログイン等でリンクを確認できなかった（`?error=<理由>`）
 */
export type LoginNotice = 'link_error';

export interface LoginNoticeLabels {
  /** 使用済み・期限切れの再設定リンク（`#error_description`）で戻った場合のダイアログ */
  invalidLinkTitle: string;
  invalidLinkBody: string;
}

const noopSubscribe = () => () => {};

function readNotice(): LoginNotice | null {
  return new URLSearchParams(window.location.search).has('error') ? 'link_error' : null;
}

/**
 * ログイン画面の案内（リンクのエラー）を URL から読み取る共通フック
 *
 * Supabase 標準の確認画面を経由したリンクが使用済み・期限切れの場合は、
 * `#error_description` 付きで戻ってくるため、再設定メールの再送を促すダイアログを出す。
 * 表示にはページ側で `ConfirmContainer` を置くこと。
 */
export function useLoginNotice(
  labels: LoginNoticeLabels,
  options: { forgotPasswordPath?: string } = {},
): LoginNotice | null {
  const { showConfirm } = useConfirm();
  const router = useRouter();
  const { invalidLinkTitle, invalidLinkBody } = labels;
  const forgotPasswordPath = options.forgotPasswordPath ?? '/forgot-password';

  const notice = useSyncExternalStore(noopSubscribe, readNotice, () => null);

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes('error_description')) return;
    if (!new URLSearchParams(hash.substring(1)).get('error_description')) return;

    // 再読み込みで同じダイアログが出ないよう、ハッシュだけ消す（?next= 等は残す）
    window.history.replaceState(null, '', window.location.pathname + window.location.search);

    void (async () => {
      const confirmed = await showConfirm(invalidLinkTitle, invalidLinkBody, { variant: 'info' });
      if (confirmed) router.push(forgotPasswordPath);
    })();
  }, [showConfirm, router, invalidLinkTitle, invalidLinkBody, forgotPasswordPath]);

  return notice;
}
