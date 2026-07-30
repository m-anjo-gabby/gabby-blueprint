// apps/coach/app/(app)/dashboard/_components/statsConfig.ts
import { Users, CalendarClock, MessageSquareWarning, TrendingUp, type LucideIcon } from 'lucide-react';

export type StatKey = 'students' | 'lessons' | 'feedback' | 'completion';

export interface StatEntry {
  key: StatKey;
  title: string;
  desc: string;
  icon: LucideIcon;
  accentClass: string;
  value: string;
  valueLabel: string;
  alertCount: number;
  alertLabel: string;
}

/**
 * 担当生徒・レッスン管理はまだ未実装のため、初期ドラフトでは静的なサンプル値を表示しています。
 * 実データは担当生徒テーブル等のスキーマ設計後、adminDashboardAction.ts と同様のサーバーアクションに置き換える想定です。
 */
export const DASHBOARD_STATS: readonly StatEntry[] = [
  {
    key: 'students',
    title: 'Assigned Students',
    desc: 'Students currently assigned to you',
    icon: Users,
    accentClass: 'bg-blue-50 text-blue-600 border-blue-100',
    value: '12',
    valueLabel: 'Students',
    alertCount: 2,
    alertLabel: 'Not contacted',
  },
  {
    key: 'lessons',
    title: "This Week's Lessons",
    desc: 'Number of scheduled coaching sessions',
    icon: CalendarClock,
    accentClass: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    value: '5',
    valueLabel: 'Sessions',
    alertCount: 0,
    alertLabel: 'Needs adjustment',
  },
  {
    key: 'feedback',
    title: 'Pending Feedback',
    desc: 'Awaiting reply to student submissions and questions',
    icon: MessageSquareWarning,
    accentClass: 'bg-rose-50 text-rose-600 border-rose-100',
    value: '3',
    valueLabel: 'Items',
    alertCount: 3,
    alertLabel: 'Needs reply',
  },
  {
    key: 'completion',
    title: "This Month's Completion Rate",
    desc: 'Average assignment completion rate for your students',
    icon: TrendingUp,
    accentClass: 'bg-purple-50 text-purple-600 border-purple-100',
    value: '78',
    valueLabel: '%',
    alertCount: 0,
    alertLabel: 'Below target',
  },
] as const;
