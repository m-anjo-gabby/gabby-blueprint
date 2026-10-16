import type { ReactNode } from 'react';
import { CalendarClock, Star } from 'lucide-react';
import { Section } from '@/components/common/Section';
import { DashboardHeaderSkeleton } from './DashboardHeader';
import { AttentionStripSkeleton } from './AttentionStrip';
import { TodaysSessionsPanelSkeleton } from './TodaysSessionsPanel';
import { SessionTasksPanelSkeleton } from './SessionTasksPanel';
import { MyRatingCardSkeleton } from '@/components/rating/MyRatingCard';

interface DashboardLayoutProps {
  header: ReactNode;
  attention: ReactNode;
  todaysSessions: ReactNode;
  sessionTasks: ReactNode;
  rating: ReactNode;
}

/**
 * ダッシュボードの外形（見出し・注意帯・Sessions の2区画・自分の評価）。
 * page.tsx と読み込み中の骨組みで共有し、骨組み→本番で並び・幅がずれないようにする。
 */
export function DashboardLayout({ header, attention, todaysSessions, sessionTasks, rating }: DashboardLayoutProps) {
  return (
    <div className="space-y-8">
      {header}
      {attention}
      <Section label="Sessions" icon={CalendarClock}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {todaysSessions}
          {sessionTasks}
        </div>
      </Section>
      <Section label="Rating" icon={Star}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">{rating}</div>
      </Section>
    </div>
  );
}

/** ダッシュボードの読み込み中表示（loading.tsx 用）。見出し・区画の見出しは本物、データ部分は骨組み */
export function DashboardSkeleton() {
  return (
    <div role="status" aria-busy aria-label="Loading...">
      <DashboardLayout
        header={<DashboardHeaderSkeleton />}
        attention={<AttentionStripSkeleton />}
        todaysSessions={<TodaysSessionsPanelSkeleton />}
        sessionTasks={<SessionTasksPanelSkeleton />}
        rating={<MyRatingCardSkeleton />}
      />
    </div>
  );
}
