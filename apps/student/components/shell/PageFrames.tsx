import { cn } from '@/lib/utils';

interface PanelFrameProps {
  children: React.ReactNode;
  /**
   * true: 画面全体（h-dvh）を占有する没入（フォーカス）画面用。
   * false: アプリシェル内（ヘッダー・タブを除いた高さ）に収める。
   */
  fullScreen?: boolean;
}

/**
 * パネル型画面（一覧カードを画面内に固定し、内部だけをスクロールさせる画面）の共通枠。
 * 外側のスクロールは禁止し、モバイル端末の端にカードが張り付かないよう余白を確保する。
 */
export function PanelFrame({ children, fullScreen = false }: PanelFrameProps) {
  return (
    <div
      className={cn(
        'w-full flex flex-col items-center justify-center p-2 sm:p-4 overflow-hidden touch-none selection:bg-indigo-100',
        fullScreen ? 'h-dvh' : 'h-full'
      )}
    >
      {children}
    </div>
  );
}

const CONTENT_WIDTH_CLASS = {
  /** 1カラムの読み物・フォーム向け */
  narrow: 'max-w-full md:max-w-160',
  /** カードをグリッドで並べるホーム向け */
  wide: 'max-w-5xl',
  /** 最大幅を設けない（モニター等の横に広い画面） */
  full: '',
} as const;

interface ContentFrameProps {
  children: React.ReactNode;
  width?: keyof typeof CONTENT_WIDTH_CLASS;
}

/** 通常スクロール型画面（ホーム・プロフィール等）の共通枠 */
export function ContentFrame({ children, width = 'narrow' }: ContentFrameProps) {
  return (
    <div className="relative flex justify-center px-4 sm:px-6 py-4 sm:py-8">
      {/* 左上にうっすらとした「光の溜まり」を置く */}
      <div className="absolute top-0 left-0 w-full h-96 bg-[radial-gradient(circle_at_20%_0%,rgba(99,102,241,0.03)_0%,transparent_50%)] pointer-events-none" />
      <div className={cn('relative w-full animate-in fade-in slide-in-from-bottom-2 duration-700', CONTENT_WIDTH_CLASS[width])}>
        {children}
      </div>
    </div>
  );
}
