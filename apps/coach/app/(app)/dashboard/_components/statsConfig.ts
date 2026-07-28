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
    title: '担当生徒数',
    desc: '現在アサインされている生徒',
    icon: Users,
    accentClass: 'bg-blue-50 text-blue-600 border-blue-100',
    value: '12',
    valueLabel: '名',
    alertCount: 2,
    alertLabel: '未接触',
  },
  {
    key: 'lessons',
    title: '今週のレッスン予定',
    desc: 'コーチングセッションの予定件数',
    icon: CalendarClock,
    accentClass: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    value: '5',
    valueLabel: '件',
    alertCount: 0,
    alertLabel: '要調整',
  },
  {
    key: 'feedback',
    title: '未対応のフィードバック',
    desc: '生徒からの提出物・質問への返信待ち',
    icon: MessageSquareWarning,
    accentClass: 'bg-rose-50 text-rose-600 border-rose-100',
    value: '3',
    valueLabel: '件',
    alertCount: 3,
    alertLabel: '要返信',
  },
  {
    key: 'completion',
    title: '今月の学習完了率',
    desc: '担当生徒の課題消化率（平均）',
    icon: TrendingUp,
    accentClass: 'bg-purple-50 text-purple-600 border-purple-100',
    value: '78',
    valueLabel: '%',
    alertCount: 0,
    alertLabel: '目標未達',
  },
] as const;
