'use client';

import Link from 'next/link';
import { ArrowRight, ChevronLeft, User } from 'lucide-react';
import { getProfileIconUrl } from '@gabby/lib/profile/getProfileIconUrl';
import type { LiveSessionCoachOption } from '@gabby/types/liveSessionRoom';

interface Props {
  coaches: LiveSessionCoachOption[];
}

export function CoachPicker({ coaches }: Props) {
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

        <p className="text-[13px] text-slate-500">レッスンを開始する専属コーチを選択してください。</p>
      </header>

      <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-3 bg-slate-50/50 space-y-2">
        {coaches.map((coach) => {
          const iconUrl = getProfileIconUrl(coach.coachIconPath);
          return (
            <Link
              key={coach.coachId}
              href={`/live-room/${coach.coachId}`}
              className="flex items-center gap-3.5 px-3.5 py-3.5 bg-white rounded-[24px] border border-slate-100 shadow-sm hover:bg-slate-50 active:scale-[0.99] transition-all group"
            >
              <div className="w-12 h-12 rounded-full bg-rose-50 overflow-hidden flex items-center justify-center text-rose-400 shrink-0">
                {iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={iconUrl} alt={coach.coachName} className="w-full h-full object-cover" />
                ) : (
                  <User size={20} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-slate-800 truncate">{coach.coachName} コーチ</p>
                <p className="text-[13px] text-slate-500 truncate mt-0.5">タップしてビデオレッスンを開始</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-rose-50 group-hover:text-rose-600 transition-all shrink-0">
                <ArrowRight size={15} strokeWidth={2.5} />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
