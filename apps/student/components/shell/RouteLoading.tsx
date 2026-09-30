import { LoadingScreen, PageSkeleton, type PageSkeletonVariant } from '@gabby/lib/components/common/PageSkeleton';
import { ContentFrame, type ContentWidth } from './PageFrames';

const LABEL = '読み込み中';

interface RouteLoadingProps {
  variant?: PageSkeletonVariant;
  /**
   * 画面の枠（ContentFrame）の幅。
   * 各画面の layout.tsx より上の階層に置く loading.tsx では枠が無いため指定する。
   * layout.tsx と同じ階層以下に置く場合は、枠は layout 側が持つので省略する。
   */
  frame?: ContentWidth;
}

/** シェル内の loading.tsx 用の標準の骨組み（画面遷移中に即座に表示する） */
export function RouteLoading({ variant, frame }: RouteLoadingProps) {
  const skeleton = <PageSkeleton label={LABEL} variant={variant} />;
  return frame ? <ContentFrame width={frame}>{skeleton}</ContentFrame> : skeleton;
}

/** 没入画面への出入り時の全画面の読み込み表示 */
export function ImmersiveLoading() {
  return <LoadingScreen label={LABEL} className="text-ink-muted" />;
}

/**
 * 画面専用の骨組みの外枠（読み上げ用の「読み込み中」を付ける）。
 * 中身は各画面の XxxSkeleton が本番と同じ枠・グリッドで描く。見出しなどデータに依存しない部分は本物を描き、
 * データに依存する部分だけを骨組みにすることで、骨組み→本番の切り替えを「中身が埋まるだけ」にする。
 */
export function RouteSkeleton({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy aria-label={LABEL} className={className}>
      {children}
    </div>
  );
}
