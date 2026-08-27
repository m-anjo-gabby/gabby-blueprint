'use client';

import { useConfirm } from './useConfirm';

export interface UseExitConfirmFlowOptions {
  /** true を返した場合、確認ダイアログを出さずに離脱処理全体を中断する（例: 自動再生中は離脱不可 等） */
  guard?: () => boolean;
  confirmTitle: string;
  confirmMessage: string;
  confirmVariant?: 'danger' | 'warning' | 'info';
  /** 離脱処理中のローディング表示切り替え（setExitLoading 等） */
  setLoading?: (loading: boolean) => void;
  /** 確認後、最初に行うクリーンアップ（stopAllAudio 等） */
  cleanup?: () => void;
  /** クリーンアップ後に実行する非同期処理（進捗の同期送信等）。失敗してもフローは継続する */
  sync?: () => Promise<void>;
  /** onExit 呼び出し前に待機する猶予（ms）。iOSのマイク解放待ち等に使用。未指定なら即時実行 */
  bufferMs?: number;
  /** 確認〜クリーンアップ〜同期がすべて完了した後に呼ばれる実際の離脱処理（router.back() や onExit() 等） */
  onExit: () => void;
}

/**
 * Word/Sprint（Drill・Time）で共通の「離脱確認ダイアログ→ローディング表示→
 * クリーンアップ→進捗同期→（任意で猶予待ち）→実際の離脱」という一連の流れを1つにまとめたフック。
 * 画面ごとに異なる部分（確認文言・同期の要否・離脱後アクション）はオプションで注入する。
 */
export function useExitConfirmFlow(options: UseExitConfirmFlowOptions) {
  const { showConfirm } = useConfirm();

  const requestExit = async () => {
    if (options.guard?.()) return;

    const ok = await showConfirm(options.confirmTitle, options.confirmMessage, {
      variant: options.confirmVariant ?? 'info',
      isModal: false,
    });
    if (!ok) return;

    options.setLoading?.(true);
    options.cleanup?.();

    if (options.sync) {
      try {
        await options.sync();
      } catch (e) {
        console.error(e);
      }
    }

    if (options.bufferMs) {
      setTimeout(() => options.onExit(), options.bufferMs);
    } else {
      options.onExit();
    }
  };

  return requestExit;
}
