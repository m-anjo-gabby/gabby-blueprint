import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { buildMonitorHref, type MonitorQuery } from './monitorQuery';

/**
 * 表示条件（URLのクエリ）を変えて再表示する。
 * クエリだけが変わる遷移では loading.tsx が出ないため、isPending で処理中を表示する。
 * タブの切り替えは履歴に残し（push）、期間・絞り込み・モニター表示の変更は履歴を積まない（replace）。
 */
export function useMonitorNavigation(query: MonitorQuery) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const navigate = (patch: Partial<MonitorQuery>, mode: 'push' | 'replace' = 'replace') => {
    const href = buildMonitorHref({ ...query, ...patch });
    startTransition(() => {
      if (mode === 'push') router.push(href);
      else router.replace(href, { scroll: false });
    });
  };

  return { navigate, isPending };
}
