'use client';

import { useMemo, useState } from 'react';
import { GraduationCap, Eye, CalendarClock } from 'lucide-react';
import { CoachBrowseItem } from '@gabby/types/matching';
import { DayOfWeek, DAYS_OF_WEEK } from '@gabby/types/coachAvailability';
import { CountryMaster } from '@gabby/types/country';
import { DAY_OF_WEEK_LABEL_JA } from '@/constants/matching';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { convertWeeklyTimeZone } from '@gabby/lib/date/date';
import { getProfileIconUrl } from '@gabby/lib/profile/getProfileIconUrl';
import { getCoachIntroVideoUrl } from '@gabby/lib/coachProfile/getCoachIntroVideoUrl';
import { getCountryFlagUrl } from '@gabby/lib/country/getCountryFlagUrl';
import { CoachProfileDialog } from '@gabby/lib/components/common/CoachProfileDialog';
import { Button } from '@/components/ui/button';

interface CoachCardProps {
  coach: CoachBrowseItem;
  countries: CountryMaster[];
  onRequest: (coach: CoachBrowseItem) => void;
}

// 表示用: コーチのローカル時刻を、生徒のタイムゾーンでの曜日・時刻に変換したブロック
interface DisplaySlot {
  availability_id: string;
  displayDay: DayOfWeek;
  displayStartTime: string;
  displayEndTime: string;
}

function formatTimeRange(startTime: string, endTime: string): string {
  return `${startTime.slice(0, 5)}-${endTime.slice(0, 5)}`;
}

/** "2024-11-01" -> "2024年11月" */
function formatCoachSinceLabel(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long' }).format(date);
}

export function CoachCard({ coach, countries, onRequest }: CoachCardProps) {
  const studentTimezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';
  const [showPreview, setShowPreview] = useState(false);

  const availabilityByDay = useMemo(() => {
    const map = new Map<DayOfWeek, DisplaySlot[]>();
    for (const slot of coach.availability) {
      const converted = convertWeeklyTimeZone(slot, coach.timezone, studentTimezone);
      const displaySlot: DisplaySlot = {
        availability_id: slot.availability_id,
        displayDay: converted.day_of_week as DayOfWeek,
        displayStartTime: converted.start_time,
        displayEndTime: converted.end_time,
      };
      const list = map.get(displaySlot.displayDay) ?? [];
      list.push(displaySlot);
      map.set(displaySlot.displayDay, list);
    }
    return map;
  }, [coach.availability, coach.timezone, studentTimezone]);

  const country = useMemo(
    () => countries.find((c) => c.country_code === coach.country_code) ?? null,
    [countries, coach.country_code]
  );

  return (
    <article className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-indigo-50 overflow-hidden flex items-center justify-center text-indigo-500 shrink-0">
          {coach.icon_path ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={getProfileIconUrl(coach.icon_path) ?? ''} alt={coach.user_name} className="w-full h-full object-cover" />
          ) : (
            <GraduationCap size={20} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-slate-800 truncate">{coach.user_name}</p>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            {country?.icon_path && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={getCountryFlagUrl(country.icon_path) ?? ''}
                alt={country.name_ja}
                className="w-3.5 h-3.5 rounded-full object-cover shrink-0"
              />
            )}
            {coach.teaching_years !== null && <span>指導歴 {coach.teaching_years}年</span>}
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setShowPreview(true)} className="shrink-0 rounded-xl">
          <Eye size={13} /> プロフィール
        </Button>
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
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wide pt-1 w-6 shrink-0">
                  {DAY_OF_WEEK_LABEL_JA[day].slice(0, 1)}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {daySlots.map((slot) => (
                    <span
                      key={slot.availability_id}
                      className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-bold border border-indigo-100"
                    >
                      {formatTimeRange(slot.displayStartTime, slot.displayEndTime)}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Button
        type="button"
        onClick={() => onRequest(coach)}
        disabled={coach.availability.length === 0}
        className="w-full rounded-xl"
      >
        <CalendarClock size={14} />
        カレンダーからリクエストする
      </Button>

      {showPreview && (
        <CoachProfileDialog
          data={{
            userName: coach.user_name,
            iconUrl: getProfileIconUrl(coach.icon_path),
            countryName: country?.name_ja ?? null,
            countryFlagUrl: getCountryFlagUrl(country?.icon_path),
            coachSinceLabel: formatCoachSinceLabel(coach.coach_since),
            education: coach.education,
            qualifications: coach.qualifications,
            teachingYearsLabel: coach.teaching_years !== null ? `${coach.teaching_years}年` : null,
            jobExperience: coach.job_experience,
            introduction: coach.introduction,
            introVideoUrl: getCoachIntroVideoUrl(coach.intro_video_path),
          }}
          labels={{
            closeLabel: '閉じる',
            coachSince: 'Gabby Coach 在籍開始',
            education: '学歴',
            qualifications: '資格',
            englishTeaching: '指導歴',
            jobExperience: '職務経験',
            personalIntroduction: '自己紹介',
            introVideo: '紹介動画',
          }}
          onClose={() => setShowPreview(false)}
        />
      )}
    </article>
  );
}
