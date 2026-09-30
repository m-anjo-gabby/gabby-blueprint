import { PageHeader, TitleTextSkeleton } from '@/components/common/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/*
 * 生徒一覧・生徒の子画面（Coach Notes 等）の見出しと骨組み。画面と読み込み中の骨組みで共有する。
 */

export function StudentsPageHeader() {
  return (
    <PageHeader
      title="My Students"
      description="Students currently and previously matched with you. Select a student to view sprint progress, live session history, and your private notes in one place."
    />
  );
}

/** StudentCard（アバター・名前・契約・次回セッション）と同じ枠・行の高さの骨組み */
function StudentCardSkeleton() {
  return (
    <Card aria-hidden className="h-full rounded-2xl border-slate-200 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <Skeleton className="size-11 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-2.5 w-24" />
          </div>
        </div>
        <Skeleton className="mt-4 h-19 w-full rounded-xl" />
      </CardContent>
    </Card>
  );
}

/** 生徒一覧の本文の骨組み（区分の見出しは本物、生徒カードを骨組み） */
export function StudentsListSkeleton() {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide">Active Students</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }, (_, i) => (
          <StudentCardSkeleton key={i} />
        ))}
      </div>
    </section>
  );
}

interface StudentChildPageHeaderProps {
  studentId: string;
  /** 「Coach Notes」等の画面名。見出しは「画面名 — 生徒名」になる */
  title: string;
  /** 生徒名。null は読み込み中（名前を骨組みにする） */
  studentName: string | null;
  className?: string;
}

/** 生徒の子画面（Coach Notes・Training Reports 等）の見出し（生徒概要への戻るリンク付き） */
export function StudentChildPageHeader({ studentId, title, studentName, className }: StudentChildPageHeaderProps) {
  return (
    <PageHeader
      className={className}
      back={{ href: `/students/${studentId}`, label: 'Back to Overview' }}
      title={
        <>
          {title} — {studentName ?? <TitleTextSkeleton />}
        </>
      }
    />
  );
}

/** 生徒の子画面の一覧部分の骨組み（本番と同じ幅で、カードの行を並べる） */
export function StudentChildListSkeleton({ className = 'max-w-2xl mx-auto' }: { className?: string }) {
  return (
    <div aria-hidden className={`${className} space-y-3`}>
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-2xl" />
      ))}
    </div>
  );
}
