'use client';

import Link from 'next/link';
import { ArrowRight, ChevronLeft, Clock, VideoOff } from 'lucide-react';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { formatDateTimeByZone } from '@gabby/lib/date/date';
import type { SessionListItem } from '@gabby/types/session';

interface Props {
  sessions: SessionListItem[];
}

export function SessionPicker({ sessions }: Props) {
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';

  return (
    <div className="flex flex-col w-full max-w-2xl h-full bg-white rounded-[32px] sm:rounded-[40px] shadow-2xl border border-slate-100 overflow-hidden">
      <header className="px-5 sm:px-8 pt-6 sm:pt-8 pb-6 border-b border-slate-50 space-y-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/dashboard"
            className="p-2 -ml-2 hover:bg-slate-100 rounded-2xl transition-all active:scale-90 text-slate-400 shrink-0"
          >
            <ChevronLeft size={24} />
          </Link>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight truncate">ライブセッション</h1>
        </div>

        <p className="text-[13px] text-slate-500">参加するレッスンを選択してください。</p>
      </header>

      <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-3 bg-slate-50/50 space-y-2">
        {sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-300 mb-4 border border-rose-100/60">
              <VideoOff size={22} />
            </div>
            <p className="text-sm font-bold text-slate-500">参加できるレッスンがありません</p>
            <p className="text-[11px] text-slate-400 mt-1.5">レッスンの予定時刻が近づくとここに表示されます。</p>
          </div>
        )}
        {sessions.map((session) => (
          <Link
            key={session.session_id}
            href={`/live-room/${session.session_id}`}
            className="flex items-center gap-3.5 px-3.5 py-3.5 bg-white rounded-[24px] border border-slate-100 shadow-sm hover:bg-slate-50 active:scale-[0.99] transition-all group"
          >
            <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center text-rose-400 shrink-0">
              <Clock size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-slate-800 truncate">{session.counterpart_name} コーチ</p>
              <p className="text-[13px] text-slate-500 truncate mt-0.5">
                {formatDateTimeByZone(session.start_datetime, timezone, false)}
              </p>
            </div>
            <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-rose-50 group-hover:text-rose-600 transition-all shrink-0">
              <ArrowRight size={15} strokeWidth={2.5} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
