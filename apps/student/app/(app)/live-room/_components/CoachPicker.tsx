'use client';

import Link from 'next/link';
import { ArrowRight, User, Video } from 'lucide-react';
import { getProfileIconUrl } from '@gabby/lib/profile/getProfileIconUrl';
import type { LiveSessionCoachOption } from '@gabby/types/liveSessionRoom';

interface Props {
  coaches: LiveSessionCoachOption[];
}

export function CoachPicker({ coaches }: Props) {
  return (
    <div className="w-full max-w-2xl mx-auto space-y-5 py-8 px-4">
      <div className="px-1">
        <h1 className="text-lg font-black text-slate-800">ライブセッション</h1>
        <p className="text-xs text-slate-400 mt-1">レッスンを開始するコーチを選択してください</p>
      </div>

      <div className="space-y-3">
        {coaches.map((coach) => {
          const iconUrl = getProfileIconUrl(coach.coachIconPath);
          return (
            <Link
              key={coach.coachId}
              href={`/live-room/${coach.coachId}`}
              className="flex items-center gap-4 bg-white border border-slate-100 rounded-[24px] px-5 py-4 shadow-sm hover:bg-slate-50/80 hover:border-slate-200 transition-all group active:scale-[0.99]"
            >
              <div className="w-12 h-12 rounded-full bg-slate-100 overflow-hidden flex items-center justify-center text-slate-400 shrink-0">
                {iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={iconUrl} alt={coach.coachName} className="w-full h-full object-cover" />
                ) : (
                  <User size={22} />
                )}
              </div>
              <div className="flex-1">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-rose-600 mb-0.5">Live Session</p>
                <p className="text-sm font-black text-slate-700">{coach.coachName} コーチ</p>
              </div>
              <div className="flex items-center gap-2 text-rose-500 shrink-0">
                <Video size={16} />
                <ArrowRight size={16} className="text-slate-300 group-hover:text-rose-600 group-hover:translate-x-0.5 transition-all" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
