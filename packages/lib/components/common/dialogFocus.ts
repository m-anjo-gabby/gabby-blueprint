/**
 * ダイアログ・ボトムシート・サイドシート（Radix Dialog 系・vaul）を開いた時のフォーカスの既定。
 *
 * Radix は開いた時に中の最初の操作できる要素（×ボタン等）へフォーカスを移すため、
 * 開いただけでボタンにフォーカスの枠が出てしまう。各アプリの components/ui の Content は
 * onOpenAutoFocus の既定をこの関数にし、中の要素ではなく枠そのもの（tabIndex=-1）にフォーカスする
 * （読み上げはダイアログとして伝わり、Tab で中の要素へ進め、Esc で閉じられる）。
 *
 * 開いた時に特定の要素へフォーカスしたい場合（入力が主の画面等）は、その要素に autoFocus を付ける。
 * Radix は開いた時点で中にフォーカスがあれば何もしないため、autoFocus が優先される。
 */
export function focusDialogContent(event: Event): void {
  event.preventDefault();
  // Radix はこのイベントを Content の枠に対して発火する（currentTarget = 枠）
  const container = event.currentTarget;
  if (container instanceof HTMLElement) container.focus({ preventScroll: true });
}
