import { cn } from '@/lib/utils';

interface PanelFrameProps {
  children: React.ReactNode;
}

/**
 * 没入（フォーカス）画面の共通枠（トレーニング・ライブ通話等、ナビを出さない画面）。
 * 画面全体（h-dvh）を占有し、外側のスクロールは禁止して内部（ImmersiveBody）だけをスクロールさせる。
 * 中身は `ImmersivePanel` で包む。モバイルでは端末の画面そのものをパネルとみなすため余白を取らない。
 */
export function PanelFrame({ children }: PanelFrameProps) {
  return (
    <div className="w-full h-dvh flex flex-col items-center justify-center overflow-hidden touch-none sm:p-4 selection:bg-brand-100">
      {children}
    </div>
  );
}

interface ImmersivePanelProps extends React.HTMLAttributes<HTMLElement> {
  /** 画面の主領域として置く場合は 'main' */
  as?: 'div' | 'main';
}

/**
 * 没入画面のパネル本体（PanelFrame の直下に1つ置く）。
 * - モバイル: 画面いっぱいに広げる（角丸・枠・影なし）。端末の角丸と二重にならず、余白も使い切る
 * - sm 以上: 幅を絞った角丸パネルとして背景から浮かせ、アプリの画面らしく見せる
 * 中は flex-col なので、ヘッダー・フッターは shrink-0、スクロールする本文は ImmersiveBody で組む。
 */
export function ImmersivePanel({ as: Comp = 'div', className, ...props }: ImmersivePanelProps) {
  return (
    <Comp
      className={cn(
        'relative flex h-full w-full flex-col overflow-hidden bg-surface text-ink',
        'sm:max-w-2xl sm:rounded-panel sm:border sm:border-line sm:shadow-xl',
        className
      )}
      {...props}
    />
  );
}

/**
 * 没入画面の本文（スクロール領域）。ImmersivePanel の直下でヘッダー・フッターの間に置く。
 * 端までスクロールしてもパネルの外へスクロールを伝えない（土台が動いて見出しが見切れないようにする）。
 * 自動スクロールは `scrollIntoContainer`（lib/scroll.ts）がこの領域だけを動かす。
 */
export function ImmersiveBody({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-scroll-container
      className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain', className)}
      {...props}
    />
  );
}

const CONTENT_WIDTH_CLASS = {
  /** 1カラムの読み物・フォーム向け */
  narrow: 'max-w-full md:max-w-160',
  /** 一覧（お知らせ・チャット・ライブセッション等）向け */
  medium: 'max-w-3xl',
  /** カードをグリッドで並べる画面（ホーム・教材・トレーニング記録等）向け */
  wide: 'max-w-5xl',
  /** 最大幅を設けない（モニター等の横に広い画面） */
  full: '',
} as const;

export type ContentWidth = keyof typeof CONTENT_WIDTH_CLASS;

interface ContentFrameProps {
  children: React.ReactNode;
  width?: ContentWidth;
  /**
   * シェルの表示領域の高さいっぱいに広げ、中の区画ごとにスクロールさせる（チャットの2ペイン専用）。
   * 一覧とタイムラインを別々にスクロールさせ、入力欄を下端に固定する必要があるため、
   * 「スクロールはシェルの <main> に任せる」の例外として扱う。モバイルでは余白を取らず端まで広げる。
   */
  fill?: boolean;
}

/**
 * アプリシェル内の画面の共通枠（スクロールはシェルの <main> に任せる）。
 * 表示時のアニメーション（フェード・スライド）は付けない。読み込み中の骨組み（外側の loading.tsx）の枠から
 * 画面の layout.tsx の枠へ置き換わるたびに再生され、骨組み→本番の切り替えがちらついて見えるため。
 */
export function ContentFrame({ children, width = 'narrow', fill = false }: ContentFrameProps) {
  if (fill) {
    return (
      <div className="flex h-full justify-center sm:px-6 sm:py-6">
        <div className={cn('flex h-full min-h-0 w-full flex-col', CONTENT_WIDTH_CLASS[width])}>{children}</div>
      </div>
    );
  }
  return (
    <div className="flex justify-center px-4 sm:px-6 py-4 sm:py-8">
      <div className={cn('relative w-full', CONTENT_WIDTH_CLASS[width])}>
        {children}
      </div>
    </div>
  );
}
