'use client';

import { useState } from 'react';

export interface UseIncrementalRevealResult<T> {
  visibleItems: T[];
  hasMore: boolean;
  remainingCount: number;
  showMore: () => void;
  reset: () => void;
}

/**
 * 件数が増え続ける履歴系リスト（申請一覧のHistory、Live Sessionsカードの実施済み・
 * 変更履歴タブ等）を「最初はpageSize件だけ表示し、ボタン押下で追加表示する」ための
 * 共通フック。コーチ側・生徒側の複数画面で同じUXを使うため切り出した。
 * 表示対象の配列（リストそのもの）が切り替わる場合（例: 選択中の契約を変更した等）は
 * 呼び出し側で reset() を呼び、ページングを初期状態に戻すこと。
 */
export function useIncrementalReveal<T>(items: T[], pageSize = 10): UseIncrementalRevealResult<T> {
  const [visibleCount, setVisibleCount] = useState(pageSize);

  return {
    visibleItems: items.slice(0, visibleCount),
    hasMore: items.length > visibleCount,
    remainingCount: Math.max(items.length - visibleCount, 0),
    showMore: () => setVisibleCount((prev) => prev + pageSize),
    reset: () => setVisibleCount(pageSize),
  };
}
