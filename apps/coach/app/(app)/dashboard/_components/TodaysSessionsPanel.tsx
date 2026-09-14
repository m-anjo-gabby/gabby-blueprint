'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getMySessions } from '@/actions/sessionAction';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { toIsoDateInZone } from '@gabby/lib/date/date';
import { SessionListItem, SESSION_STATUS } from '@gabby/types/session';
import { LIVE_SESSION_END_AFTER_MS } from '@gabby/lib/liveSessionRoom/constants';

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

export default function TodaysSessionsPanel() {
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';
  const [next24hSessions, setNext24hSessions] = useState<SessionListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const now = new Date();
      // 実施中（開始済みだがまだEnd Session前）のセッションも表示したいので、下限は
      // nowではなくLIVE_SESSION_END_AFTER_MS分だけ過去に広げる。この定数はVideo SDKの
      // 最大通話時間の猶予（SessionHubのisPastActionWindowと同じ基準）で、通話が
      // 押して終了間際でも取りこぼさないための余裕を兼ねる。
      const rangeStart = new Date(now.getTime() - LIVE_SESSION_END_AFTER_MS);
      const rangeEnd = new Date(now.getTime() + WINDOW_MS);
      const data = await getMySessions(rangeStart.toISOString(), rangeEnd.toISOString());
      if (!cancelled) {
        // 表示直前の"now"を基準に、まだ実施可能ウィンドウ内（SessionHubのisPastActionWindow
        // と同じ基準）のセッションだけに絞る。クエリの下限は取りこぼし防止のために広めに
        // 取っているため、ここで正確な条件に絞り直す。
        const nowMs = now.getTime();
        setNext24hSessions(
          data
            .filter((s) => s.status === SESSION_STATUS.SCHEDULED && new Date(s.end_datetime).getTime() + LIVE_SESSION_END_AFTER_MS >= nowMs)
            .sort((a, b) => a.start_datetime.localeCompare(b.start_datetime))
        );
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [timezone]);

  const nextSessionId = next24hSessions[0]?.session_id;

  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-bold text-slate-800">Next 24 Hours</CardTitle>
        <Link href="/calendar" className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 transition-colors">
          View calendar
        </Link>
      </CardHeader>
      <CardContent className="pt-2">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-14 w-full rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : next24hSessions.length === 0 ? (
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
                        <span className="px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-600 text-[9px] font-black uppercase tracking-wider border border-indigo-100 shrink-0">
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
      </CardContent>
    </Card>
  );
}
