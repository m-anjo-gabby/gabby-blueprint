'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { PageSkeleton } from '@gabby/lib/components/common/PageSkeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ScheduleTabs } from '@/components/common/ScheduleTabs';
import { PageHeader, PageSkeletonFrame } from '@/components/common/PageHeader';
import { MonthSelector } from '@/app/(app)/monthly-reports/_components/MonthSelector';

/*
 * コーチの作業用の画面（空き時間・依頼・月次レポート・プロフィール・パスワード変更）の見出しと、読み込み中の骨組み。
 * 見出し・タブ・区分の見出しは本物を描き（page.tsx と共有）、本文は本番と同じ幅・並びの骨組みにする。
 */

// ---------- Weekly Availability ----------

export function AvailabilityPageHeader() {
  return (
    <>
      <PageHeader
        className="max-w-3xl"
        title="Weekly Availability"
        description="Set the days and times you are available for live sessions. Students will request a fixed weekly slot within these hours."
      />
      <ScheduleTabs active="availability" />
    </>
  );
}

export function AvailabilitySkeleton() {
  return (
    <PageSkeletonFrame>
      <AvailabilityPageHeader />
      <div className="max-w-4xl">
        <Card>
          <CardHeader className="space-y-1.5">
            <CardTitle>Weekly Schedule</CardTitle>
            <CardDescription>
              Click or drag to mark the days and times you are available. Sessions are booked in 30-minute blocks (each lesson runs 25 minutes).
            </CardDescription>
          </CardHeader>
          <CardContent aria-hidden>
            <Skeleton className="h-120 w-full rounded-xl" />
          </CardContent>
        </Card>
      </div>
    </PageSkeletonFrame>
  );
}

// ---------- Requests ----------

export function RequestsPageHeader() {
  return (
    <PageHeader
      back={{ href: '/calendar', label: 'Back to Calendar' }}
      title="Requests"
      description="Requests from your students — fixed weekly slot matching, new session bookings, and reschedule candidates they proposed when cancelling a session. Review and approve or decline each one here."
    />
  );
}

export function RequestsSkeleton() {
  return (
    <PageSkeletonFrame>
      <RequestsPageHeader />
      <div className="max-w-2xl mx-auto space-y-8">
        <section className="space-y-3">
          <h2 className="text-xs font-black text-brand-500 uppercase tracking-widest">Pending</h2>
          <Skeleton className="h-28 w-full rounded-xl" />
        </section>
        <section className="space-y-3">
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">History</h2>
          <Skeleton className="h-9 w-72 max-w-full rounded-lg" />
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </section>
      </div>
    </PageSkeletonFrame>
  );
}

// ---------- Monthly Report ----------

export function MonthlyReportsPageHeader() {
  return (
    <PageHeader
      title="Monthly Report"
      description="Your live session counts by student and day. Cells in amber need a lesson to be finalized; cells in rose contain a late cancellation, no-show, or early-ended session."
    />
  );
}

/** 表の骨組み（月を切り替えた時の Suspense の fallback と共有する） */
export function MonthlyReportTableSkeleton() {
  return <PageSkeleton label="Loading..." variant="table" header={false} />;
}

const currentYearMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export function MonthlyReportsSkeleton() {
  const month = useSearchParams().get('month') || currentYearMonth();
  return (
    <PageSkeletonFrame>
      <MonthlyReportsPageHeader />
      <MonthSelector currentMonth={month} />
      <MonthlyReportTableSkeleton />
    </PageSkeletonFrame>
  );
}

// ---------- Profile ----------

export function ProfilePageHeader() {
  return (
    <PageHeader
      className=""
      title="Profile Settings"
      description="Review your account information and manage your public coach profile."
    />
  );
}

export function ProfileSkeleton() {
  return (
    <PageSkeletonFrame>
      <ProfilePageHeader />
      <div className="max-w-330">
        <div aria-hidden className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
          <div className="space-y-6">
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-120 w-full rounded-2xl" />
          </div>
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
      </div>
    </PageSkeletonFrame>
  );
}

// ---------- Change Password ----------

export function PasswordSkeleton() {
  return (
    <PageSkeletonFrame className="flex flex-col items-center justify-center h-full px-4">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl shadow-slate-100 border border-slate-100">
        <h1 className="text-xl font-bold text-slate-800 mb-6">Change Password</h1>
        <div aria-hidden className="space-y-6">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="ml-1 h-3 w-32" />
              <Skeleton className="h-12.5 w-full rounded-xl" />
            </div>
          ))}
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
      </div>
    </PageSkeletonFrame>
  );
}

/**
 * プロフィール配下の読み込み中表示（loading.tsx 用）。外の画面からの遷移ではパスワード変更でも
 * プロフィールのフォルダの loading.tsx が出るため、表示中のパスで出し分ける。
 */
export function ProfileRouteSkeleton() {
  return usePathname().startsWith('/profile/password') ? <PasswordSkeleton /> : <ProfileSkeleton />;
}
