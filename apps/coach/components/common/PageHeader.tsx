import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** 見出しの上に置く戻るリンク */
  back?: { href: string; label: string };
  /** 見出し右側の補助表示（件数バッジ等）。指定すると見出しと横並びにする */
  aside?: ReactNode;
  /** 見出しの枠の幅（既定は max-w-2xl） */
  className?: string;
}

/**
 * コーチアプリの画面の見出し（戻るリンク・タイトル・説明文）。
 * 画面と読み込み中の骨組み（loading.tsx）で共有し、骨組み→本番で見出しの位置・高さがずれないようにする。
 */
export function PageHeader({ title, description, back, aside, className = 'max-w-2xl' }: PageHeaderProps) {
  const heading = (
    <div className={aside ? 'min-w-0' : className}>
      {back && (
        <Link
          href={back.href}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors mb-2"
        >
          <ArrowLeft size={14} />
          {back.label}
        </Link>
      )}
      <h1 className="text-xl font-bold text-slate-800 tracking-tight">{title}</h1>
      {description && <p className="text-[13px] text-slate-500 mt-1">{description}</p>}
    </div>
  );
  if (!aside) return heading;
  return (
    <div className="flex items-center justify-between gap-4">
      {heading}
      {aside}
    </div>
  );
}

/** 見出し内の、データに依存する語（生徒名等）の骨組み。h1 の行の高さに収まるインライン要素 */
export function TitleTextSkeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn('inline-block h-5 w-32 animate-pulse rounded-md bg-skeleton align-middle', className)} />;
}

/** 画面専用の骨組みの外枠（読み上げ用の「読み込み中」を付ける） */
export function PageSkeletonFrame({ className = 'space-y-6', children }: { className?: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy aria-label="Loading..." className={className}>
      {children}
    </div>
  );
}

/** 一覧の行・カードの骨組みを count 個並べる（高さ・角丸は className で本番の要素に合わせる） */
export function SkeletonList({ count, className, gap = 'space-y-3' }: { count: number; className: string; gap?: string }) {
  return (
    <div aria-hidden className={gap}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={className} />
      ))}
    </div>
  );
}
