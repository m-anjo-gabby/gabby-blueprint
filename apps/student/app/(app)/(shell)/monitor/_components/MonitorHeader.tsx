'use client';

import { BookOpen, LayoutDashboard, Zap } from 'lucide-react';
import { ShellPageHeader } from '@/components/shell/ShellPage';
import { PillTabs, type PillTabItem } from '@/components/shell/PillTabs';
import { MonitorToggle } from './MonitorToggle';
import { useMonitorNavigation } from './useMonitorNavigation';
import type { MonitorQuery, MonitorViewType } from './monitorQuery';

const VIEW_TABS: readonly PillTabItem<MonitorViewType>[] = [
  { value: 'overview', label: '受講生サマリー', icon: LayoutDashboard },
  { value: 'word', label: '単語ドリル履歴', icon: BookOpen },
  { value: 'sprint', label: 'スプリント履歴', icon: Zap },
];

/** モニタリングダッシュボードの見出し・タブ・モニター表示の切り替え（page.tsx と読み込み中の骨組みで共有する） */
export function MonitorHeader({ query }: { query: MonitorQuery }) {
  const { navigate, isPending } = useMonitorNavigation(query);

  return (
    <ShellPageHeader
      title="モニタリングダッシュボード"
      description="所属する受講生のトレーニング状況を月ごとに確認し、CSVで出力できます。"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <PillTabs
            items={VIEW_TABS}
            value={query.view}
            onValueChange={(view) => navigate({ view }, 'push')}
            aria-label="表示の切り替え"
          />
        </div>
        <MonitorToggle
          checked={query.includeMonitor}
          onCheckedChange={(includeMonitor) => navigate({ includeMonitor })}
          disabled={isPending}
        />
      </div>
    </ShellPageHeader>
  );
}
