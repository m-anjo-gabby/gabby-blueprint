/** スクロール領域（シェルの <main>・没入画面の本文）に付ける目印 */
export const SCROLL_CONTAINER_ATTR = 'data-scroll-container';
/** スクロール領域の上部に固定表示する段（ShellPageHeader のツールバー等）に付ける目印 */
export const SCROLL_STICKY_ATTR = 'data-scroll-sticky';

interface ScrollIntoContainerOptions {
  behavior?: ScrollBehavior;
  /** 'center': 見える範囲の中央へ寄せる / 'start': 見える範囲の上端へ寄せる */
  block?: 'center' | 'start';
}

/**
 * 要素が見えるよう、一番近いスクロール領域（`data-scroll-container`）だけをスクロールする。
 * `scrollIntoView` はスクロールできる祖先をすべて動かし、iOS Safari ではページ全体や
 * 没入画面の土台までずらして見出しが見切れるため、こちらを使う。
 * 上部に固定表示の段（`data-scroll-sticky`）がある場合は、その下の見える範囲を基準にする。
 */
export function scrollIntoContainer(el: HTMLElement, { behavior = 'smooth', block = 'center' }: ScrollIntoContainerOptions = {}) {
  const container = el.parentElement?.closest<HTMLElement>(`[${SCROLL_CONTAINER_ATTR}]`);
  if (!container) return;

  const sticky = container.querySelector<HTMLElement>(`[${SCROLL_STICKY_ATTR}]`);
  const containerRect = container.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const visibleTop = containerRect.top + (sticky?.offsetHeight ?? 0);
  const visibleHeight = containerRect.bottom - visibleTop;

  // 見える範囲より高い要素は上端を合わせる（中央に寄せると先頭が隠れる）
  const offset =
    block === 'center' && elRect.height < visibleHeight
      ? elRect.top - visibleTop - (visibleHeight - elRect.height) / 2
      : elRect.top - visibleTop;

  container.scrollTo({ top: container.scrollTop + offset, behavior });
}
