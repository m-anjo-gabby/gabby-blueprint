import { cn } from '@/lib/utils';

interface PanelFrameProps {
  children: React.ReactNode;
}

/**
 * 没入（フォーカス）画面の共通枠（トレーニング・ライブ通話・チャットルーム等、ナビを出さない画面）。
 * 画面全体（h-dvh）を占有し、外側のスクロールは禁止して内部だけをスクロールさせる。
 * モバイル端末の端にカードが張り付かないよう余白を確保する。
 */
export function PanelFrame({ children }: PanelFrameProps) {
  return (
    <div className="w-full h-dvh flex flex-col items-center justify-center overflow-hidden touch-none p-2 sm:p-4 selection:bg-brand-100">
      {children}
    </div>
  );
}

const CONTENT_WIDTH_CLASS = {
  /** 1カラムの読み物・フォーム向け */
  narrow: 'max-w-full md:max-w-160',
  /** 一覧（お知らせ・チャット・ライブセッション等）向け */
  medium: 'max-w-3xl',
  /** カードをグリッドで並べる画面（ホーム・教材・学習記録等）向け */
  wide: 'max-w-5xl',
  /** 最大幅を設けない（モニター等の横に広い画面） */
  full: '',
} as const;

interface ContentFrameProps {
  children: React.ReactNode;
  width?: keyof typeof CONTENT_WIDTH_CLASS;
}

/** アプリシェル内の画面の共通枠（スクロールはシェルの <main> に任せる） */
export function ContentFrame({ children, width = 'narrow' }: ContentFrameProps) {
  return (
    <div className="flex justify-center px-4 sm:px-6 py-4 sm:py-8">
      <div className={cn('relative w-full animate-in fade-in slide-in-from-bottom-2 duration-700', CONTENT_WIDTH_CLASS[width])}>
        {children}
      </div>
    </div>
  );
}
