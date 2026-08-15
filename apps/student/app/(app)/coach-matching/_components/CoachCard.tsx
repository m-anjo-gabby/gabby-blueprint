'use client';

import { useMemo } from 'react';
import { GraduationCap } from 'lucide-react';
import { CoachBrowseItem } from '@gabby/types/matching';
import { DayOfWeek, DAYS_OF_WEEK } from '@gabby/types/coachAvailability';
import { DAY_OF_WEEK_LABEL_JA } from '@/constants/matching';

interface CoachCardProps {
  coach: CoachBrowseItem;
  onSelectBlock: (dayOfWeek: DayOfWeek, startTime: string, endTime: string) => void;
}

function formatTimeRange(startTime: string, endTime: string): string {
  return `${startTime.slice(0, 5)}-${endTime.slice(0, 5)}`;
}

export function CoachCard({ coach, onSelectBlock }: CoachCardProps) {
  const availabilityByDay = useMemo(() => {
    const map = new Map<DayOfWeek, typeof coach.availability>();
    for (const slot of coach.availability) {
      const list = map.get(slot.day_of_week) ?? [];
      list.push(slot);
      map.set(slot.day_of_week, list);
    }
    return map;
  }, [coach.availability]);

  return (
    <article className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-500 shrink-0">
          <GraduationCap size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-slate-800 truncate">{coach.user_name}</p>
          <p className="text-[11px] text-slate-400">
            {coach.teaching_years !== null ? `指導歴 ${coach.teaching_years}年` : ''}
          </p>
        </div>
      </div>

      {coach.introduction && (
        <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{coach.introduction}</p>
      )}

      {coach.availability.length === 0 ? (
        <p className="text-xs text-slate-400">現在、対応可能時間の登録がありません</p>
      ) : (
        <div className="space-y-1.5">
          {DAYS_OF_WEEK.map((day) => {
            const daySlots = availabilityByDay.get(day);
            if (!daySlots || daySlots.length === 0) return null;
            return (
              <div key={day} className="flex items-start gap-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wide pt-1.5 w-10 shrink-0">
                  {DAY_OF_WEEK_LABEL_JA[day].slice(0, 1)}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {daySlots.map((slot) => (
                    <button
                      key={slot.availability_id}
                      type="button"
                      onClick={() => onSelectBlock(day, slot.start_time, slot.end_time)}
                      className="px-2.5 py-1 rounded-full bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-700 text-[11px] font-bold border border-indigo-100 hover:border-indigo-600 transition-colors"
                    >
                      {formatTimeRange(slot.start_time, slot.end_time)}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}
