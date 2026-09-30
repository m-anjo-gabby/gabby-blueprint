'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { RouteLoading } from '@/components/common/RouteLoading';
import { PageSkeletonFrame } from '@/components/common/PageHeader';
import { StudentOverviewSkeleton } from '../[id]/_components/OverviewSkeletons';
import {
  LessonSprintResultSkeleton,
  LessonSprintSetupSkeleton,
  SessionHubSkeleton,
  SessionResultSkeleton,
} from '../[id]/_components/LiveSessionSkeletons';
import { StudentChildListSkeleton, StudentChildPageHeader, StudentsListSkeleton, StudentsPageHeader } from './StudentsSkeletons';

/** 生徒の子画面のうち、見出し＋一覧の形の画面（パスの末尾 → 画面名・幅） */
const CHILD_LIST_PAGES: Record<string, { title: string; header: string; body: string }> = {
  'coach-notes': { title: 'Coach Notes', header: 'max-w-2xl', body: 'max-w-2xl mx-auto' },
  'training-reports': { title: 'Training Reports', header: 'max-w-2xl', body: 'max-w-2xl mx-auto' },
  'lesson-sprint/history': { title: 'Live Sprint History', header: 'max-w-2xl', body: 'max-w-2xl mx-auto' },
  'dialogue-practice': { title: 'Dialogue Practice', header: 'max-w-3xl', body: 'max-w-3xl mx-auto' },
};

/**
 * 生徒一覧配下（/students/**）の読み込み中表示。
 * 外の画面からの遷移では、子の画面でも親フォルダの loading.tsx が出るため、表示中のパスで骨組みを出し分ける
 * （students/・students/[id]/・その下の各 loading.tsx から使う）。
 * セッションハブ・Live Sprint 等のライブセッション関連の画面は、本番と同じ没入表示の骨組みにする。
 */
export function StudentsRouteSkeleton() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, , studentId, ...rest] = pathname.split('/');
  const subPath = rest.join('/');

  if (!studentId) {
    return (
      <PageSkeletonFrame>
        <StudentsPageHeader />
        <StudentsListSkeleton />
      </PageSkeletonFrame>
    );
  }
  if (!subPath) {
    return (
      <PageSkeletonFrame>
        <StudentOverviewSkeleton />
      </PageSkeletonFrame>
    );
  }
  // ライブセッション関連（/sessions/[sessionId]・/sessions/[sessionId]/result・/lesson-sprint・/lesson-sprint/result/[id]）
  const [section, second, third] = rest;
  if (section === 'sessions' && second) {
    const frame = third === 'result' ? <SessionResultSkeleton studentId={studentId} /> : <SessionHubSkeleton studentId={studentId} />;
    return <PageSkeletonFrame className="">{frame}</PageSkeletonFrame>;
  }
  if (section === 'lesson-sprint' && !second) {
    return <PageSkeletonFrame className=""><LessonSprintSetupSkeleton /></PageSkeletonFrame>;
  }
  if (section === 'lesson-sprint' && second === 'result') {
    return (
      <PageSkeletonFrame className="">
        <LessonSprintResultSkeleton studentId={studentId} sessionId={searchParams.get('session_id')} />
      </PageSkeletonFrame>
    );
  }

  const child = CHILD_LIST_PAGES[subPath];
  if (child) {
    return (
      <PageSkeletonFrame>
        <StudentChildPageHeader studentId={studentId} title={child.title} studentName={null} className={child.header} />
        <StudentChildListSkeleton className={child.body} />
      </PageSkeletonFrame>
    );
  }
  return <RouteLoading variant="list" />;
}
