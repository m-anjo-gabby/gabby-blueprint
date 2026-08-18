'use client';

import { useMemo, useState } from 'react';
import { GraduationCap, Eye, CalendarClock } from 'lucide-react';
import { CoachBrowseItem } from '@gabby/types/matching';
import { DayOfWeek } from '@gabby/types/coachAvailability';
import { CountryMaster } from '@gabby/types/country';
import { DAY_OF_WEEK_LABEL_JA, slotMatchesFilter } from '@/constants/matching';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { convertWeeklyTimeZone } from '@gabby/lib/date/date';
import { getProfileIconUrl } from '@gabby/lib/profile/getProfileIconUrl';
import { getCoachIntroVideoUrl } from '@gabby/lib/coachProfile/getCoachIntroVideoUrl';
import { getCountryFlagUrl } from '@gabby/lib/country/getCountryFlagUrl';
import { CoachProfileDialog } from '@gabby/lib/components/common/CoachProfileDialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const VISIBLE_SLOT_COUNT = 3;

interface CoachCardProps {
  coach: CoachBrowseItem;
  countries: CountryMaster[];
  onRequest: (coach: CoachBrowseItem) => void;
  selectedDays: Set<DayOfWeek>;
  selectedTimeBuckets: Set<string>;
}

// 表示用: コーチのローカル時刻を、生徒のタイムゾーンでの曜日・時刻に変換したブロック
interface DisplaySlot {
  availability_id: string;
  displayDay: DayOfWeek;
  displayStartTime: string;
  displayEndTime: string;
  matches: boolean;
}

/** "2024-11-01" -> "2024年11月" */
function formatCoachSinceLabel(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long' }).format(date);
}

export function CoachCard({ coach, countries, onRequest, selectedDays, selectedTimeBuckets }: CoachCardProps) {
  const studentTimezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';
  const [showPreview, setShowPreview] = useState(false);
  const [showAllSlots, setShowAllSlots] = useState(false);

  const hasActiveFilter = selectedDays.size > 0 || selectedTimeBuckets.size > 0;

  // 検索フィルターに一致する枠を先頭に、曜日・開始時刻順で並べる（カード内で優先的に見せるため）
  const sortedSlots = useMemo(() => {
    const list: DisplaySlot[] = coach.availability.map((slot) => {
      const converted = convertWeeklyTimeZone(slot, coach.timezone, studentTimezone);
      const displayDay = converted.day_of_week as DayOfWeek;
      return {
        availability_id: slot.availability_id,
        displayDay,
        displayStartTime: converted.start_time,
        displayEndTime: converted.end_time,
        matches: slotMatchesFilter(displayDay, converted.start_time, converted.end_time, selectedDays, selectedTimeBuckets),
      };
    });
    list.sort((a, b) => {
      if (a.matches !== b.matches) return a.matches ? -1 : 1;
      if (a.displayDay !== b.displayDay) return a.displayDay - b.displayDay;
      return a.displayStartTime.localeCompare(b.displayStartTime);
    });
    return list;
  }, [coach.availability, coach.timezone, studentTimezone, selectedDays, selectedTimeBuckets]);

  const visibleSlots = showAllSlots ? sortedSlots : sortedSlots.slice(0, VISIBLE_SLOT_COUNT);
  const hiddenSlotCount = sortedSlots.length - visibleSlots.length;

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
        <div className="flex flex-wrap items-center gap-1.5">
          {visibleSlots.map((slot) => (
            <span
              key={slot.availability_id}
              className={cn(
                'px-2.5 py-1 rounded-full text-[11px] font-bold border whitespace-nowrap',
                hasActiveFilter && !slot.matches
                  ? 'bg-slate-50 text-slate-400 border-slate-100'
                  : 'bg-indigo-50 text-indigo-700 border-indigo-100'
              )}
            >
              {DAY_OF_WEEK_LABEL_JA[slot.displayDay].slice(0, 1)} {slot.displayStartTime}
              <span className="hidden sm:inline">-{slot.displayEndTime}</span>
            </span>
          ))}
          {hiddenSlotCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAllSlots(true)}
              className="px-2.5 py-1 rounded-full bg-slate-50 text-slate-500 text-[11px] font-bold border border-slate-100 hover:bg-slate-100 transition-colors"
            >
              +{hiddenSlotCount}
            </button>
          )}
          {showAllSlots && sortedSlots.length > VISIBLE_SLOT_COUNT && (
            <button
              type="button"
              onClick={() => setShowAllSlots(false)}
              className="px-2 py-1 text-[11px] font-bold text-slate-400 hover:text-slate-600 transition-colors"
            >
              閉じる
            </button>
          )}
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
