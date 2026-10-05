import Link from 'next/link';
import { ArrowRight, CalendarCheck } from 'lucide-react';
import { getMySessions } from '@/actions/sessionAction';
import { toIsoDateInZone } from '@gabby/lib/date/date';
import { SESSION_STATUS } from '@gabby/types/session';
import { LIVE_SESSION_END_AFTER_MS } from '@gabby/lib/liveSessionRoom/constants';
import { DashboardPanelCard, PanelRowsSkeleton } from './DashboardPanelCard';

const WINDOW_MS = 24 * 60 * 60 * 1000;

// 「暦日としての今日」で絞ると、日付変更が近い時間帯ほど範囲が狭くなってしまう
// （例: 23時台は実質あと1時間分しか見えない）ため、確認するタイミングに関わらず
// 常に一定の見通しを保てるよう、今からの24時間というローリングウィンドウで絞り込む。
function formatSessionTimeLabel(startIso: string, endIso: string, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone });
  const timeRange = `${fmt.format(new Date(startIso))} – ${fmt.format(new Date(endIso))}`;
  const isDifferentDay = toIsoDateInZone(startIso, timeZone) !== toIsoDateInZone(new Date(), timeZone);
  return isDifferentDay ? `Tomorrow, ${timeRange}` : timeRange;
}

const VIEW_CALENDAR_LINK = (
  <Link href="/calendar" className="text-[11px] font-bold text-brand hover:text-brand-strong transition-colors">
    View calendar
  </Link>
);

/** 取得中の骨組み（Suspense の fallback と loading.tsx で共有する） */
export function TodaysSessionsPanelSkeleton() {
  return (
    <DashboardPanelCard title="Next 24 Hours" aside={VIEW_CALENDAR_LINK}>
      <PanelRowsSkeleton rows={2} />
    </DashboardPanelCard>
  );
}

/**
 * ダッシュボードの"Next 24 Hours"パネル。
 * サーバーで取得して区画単位で表示する（ブラウザでの後追い取得は、表示後の往復が増えるうえ、
 * 画面共通のサーバーアクション（通知件数等）の後ろに並んで待たされるため行わない）。
 */
export default async function TodaysSessionsPanel({ timezone }: { timezone: string }) {
  const now = new Date();
  // 実施中（開始済みだがまだEnd Session前）のセッションはgetMySessionsCore側の区間重複判定
  // （end_datetime基準）で取りこぼされずに取得できる。ここでの下限の広げ幅は、終了直後の
  // セッションもLIVE_SESSION_END_AFTER_MS分だけ猶予を持って表示し続けるためのもの
  // （SessionHubのisPastActionWindowと同じ基準）。
  const rangeStart = new Date(now.getTime() - LIVE_SESSION_END_AFTER_MS);
  const rangeEnd = new Date(now.getTime() + WINDOW_MS);
  const data = await getMySessions(rangeStart.toISOString(), rangeEnd.toISOString());

  // まだ実施可能ウィンドウ内（SessionHubのisPastActionWindowと同じ基準）のセッションだけに絞る。
  // クエリの下限は取りこぼし防止のために広めに取っているため、ここで正確な条件に絞り直す。
  const nowMs = now.getTime();
  const next24hSessions = data
    .filter((s) => s.status === SESSION_STATUS.SCHEDULED && new Date(s.end_datetime).getTime() + LIVE_SESSION_END_AFTER_MS >= nowMs)
    .sort((a, b) => a.start_datetime.localeCompare(b.start_datetime));
  const nextSessionId = next24hSessions[0]?.session_id;

  return (
    <DashboardPanelCard title="Next 24 Hours" aside={VIEW_CALENDAR_LINK}>
      {next24hSessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <CalendarCheck size={22} className="text-slate-300 mb-2" />
          <p className="text-xs font-semibold text-slate-400">No sessions in the next 24 hours</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {next24hSessions.map((session) => (
            <li key={session.session_id}>
              <Link
                href={`/students/${session.counterpart_id}/sessions/${session.session_id}`}
                className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-slate-100/80 hover:border-slate-200 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-semibold text-slate-700 truncate">{session.counterpart_name}</p>
                    {session.session_id === nextSessionId && (
                      <span className="px-1.5 py-0.5 rounded-md bg-brand-50 text-brand text-[9px] font-black uppercase tracking-wider border border-brand-100 shrink-0">
                        Up next
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {formatSessionTimeLabel(session.start_datetime, session.end_datetime, timezone)}
                  </p>
                </div>
                <ArrowRight size={14} className="text-slate-300 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DashboardPanelCard>
  );
}
