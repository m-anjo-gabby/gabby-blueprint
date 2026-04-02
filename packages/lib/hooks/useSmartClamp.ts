import { useState, useRef, useLayoutEffect } from 'react';

/**
 * テキストの溢れ（クランプ）を動的に検知し、開閉状態を管理するフック
 * CSSの line-clamp と組み合わせて、「もっと見る」ボタンの表示判定等に使用する
 */
export function useSmartClamp<T extends HTMLElement>() {
  // 監視対象のDOM要素への参照
  const ref = useRef<T | null>(null);
  
  // 現在展開されているかどうかの状態
  const [isExpanded, setIsExpanded] = useState(false);
  
  // テキストが枠に収まりきらず、省略（三点リーダー等）されているかどうかの判定
  const [isTruncated, setIsTruncated] = useState(false);

  // ブラウザの描画前に実行することで、判定による表示のチラつき（Layout Shift）を防ぐ
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    /**
     * 内容が要素の高さ（clientHeight）を超えているかチェックする
     * scrollHeight: 要素の全コンテンツの高さ
     * clientHeight: 現在表示されている枠の高さ
     */
    const check = () => {
      setIsTruncated(el.scrollHeight > el.clientHeight);
    };

    // 初回レンダリング時のチェック
    check();

    // 要素のサイズ変更（レスポンシブな幅の変化やウィンドウリサイズ）を監視
    const resizeObserver = new ResizeObserver(check);
    resizeObserver.observe(el);

    // クリーンアップ：コンポーネントのアンマウント時に監視を解除
    return () => resizeObserver.disconnect();
  }, []);

  return {
    ref,             // 対象要素の ref プロパティに渡す
    isExpanded,      // 現在展開中か
    isTruncated,     // テキストが溢れているか（ボタン表示の条件に利用）
    toggle: () => setIsExpanded(prev => !prev), // 開閉を切り替える関数
    setExpanded: setIsExpanded,                 // 明示的に開閉を設定する関数
  };
}