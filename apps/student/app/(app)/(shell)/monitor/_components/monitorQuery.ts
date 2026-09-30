import type { MonitorUser } from '@/actions/monitorAction';

export type MonitorViewType = 'overview' | 'word' | 'sprint';

export const MONITOR_VIEWS: readonly MonitorViewType[] = ['overview', 'word', 'sprint'];

/** 画面の表示条件（すべてURLのクエリで持ち、タブを切り替えても引き継ぐ） */
export interface MonitorQuery {
  view: MonitorViewType;
  /** 対象期間（YYYY-MM-DD）。省略時は当月 */
  startDate?: string;
  endDate?: string;
  /** 絞り込み中の受講生（auth.users の UUID） */
  userIds?: string[];
  /** モニター用アカウントを一覧・集計に含める */
  includeMonitor: boolean;
}

export function parseMonitorView(value: string | null | undefined): MonitorViewType {
  return MONITOR_VIEWS.find((v) => v === value) ?? 'overview';
}

export function buildMonitorHref({ view, startDate, endDate, userIds, includeMonitor }: MonitorQuery): string {
  const params = new URLSearchParams({ view });
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  if (userIds && userIds.length > 0) params.set('userIds', userIds.join(','));
  if (includeMonitor) params.set('includeMonitor', 'true');
  return `/monitor?${params.toString()}`;
}

/** 指定月（YYYY-MM）の初日と末日（YYYY-MM-DD） */
export function getMonthRange(yearMonth: string): { startDate: string; endDate: string } {
  const [year, month] = yearMonth.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, '0');
  return { startDate: `${year}-${mm}-01`, endDate: `${year}-${mm}-${String(lastDay).padStart(2, '0')}` };
}

/** YYYY-MM-DD を画面表示用の YYYY/MM/DD にする */
export function toDayLabel(isoDate: string): string {
  return isoDate.replaceAll('-', '/');
}

export function isMonitorAccount(user: Pick<MonitorUser, 'roles'>): boolean {
  return user.roles?.includes('monitor') ?? false;
}

/** 実績データ（受講生の氏名のみを持つ）にモニター表示を付けるための、モニター用アカウントのID一覧 */
export function getMonitorAccountIds(users: MonitorUser[]): Set<string> {
  return new Set(users.filter(isMonitorAccount).map((u) => u.id));
}

/** CSVをダウンロードさせる（Excelで文字化けしないよう BOM 付きの UTF-8） */
export function downloadCsv(fileName: string, header: string[], rows: (string | number)[][]): void {
  const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const content = '﻿' + [header, ...rows].map((row) => row.map(escape).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
