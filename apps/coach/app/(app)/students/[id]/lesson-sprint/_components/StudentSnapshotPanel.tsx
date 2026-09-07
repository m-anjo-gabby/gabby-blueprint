'use client';

import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UserAvatar } from '@/components/common/UserAvatar';
import { formatDateTimeByZone } from '@gabby/lib/date/date';
import { formatSprintLevelLabel, resolveCoachContentName } from '@gabby/lib';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { QUESTION_TYPES, type SprintQuestionType } from '@gabby/types/sprint';
import type { StudentOverviewProfile } from '@gabby/types/coachStudent';
import type { LessonSprintHistoryListItem } from '@gabby/types/lessonSprint';

interface Props {
  profile: StudentOverviewProfile;
  lessonSprints: LessonSprintHistoryListItem[];
  highlightedType: SprintQuestionType;
}

const TYPE_ORDER = Object.values(QUESTION_TYPES).sort((a, b) => a.seq_no - b.seq_no);

export function StudentSnapshotPanel({ profile, lessonSprints, highlightedType }: Props) {
  const timezone = useUserStore((state) => state.user?.timezone) || 'Asia/Tokyo';
  const { sprint_progress } = profile;
  const recentSprints = lessonSprints.slice(0, 3);

  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold text-slate-800">Student Snapshot</CardTitle>
      </CardHeader>
      <CardContent className="pt-2 space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
          <UserAvatar userName={profile.user_name} iconPath={profile.icon_path} size={40} />
          <span className="text-sm font-bold text-slate-800 truncate">{profile.user_name}</span>
        </div>

        <div className="space-y-1.5">
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider">
            Sprint Progress · Stage {sprint_progress.stage}
          </p>
          <div className="space-y-1">
            {TYPE_ORDER.map((type) => {
              const level = (sprint_progress[type.dbKey as keyof typeof sprint_progress] as number) ?? type.minLevel;
              const levelLabel = formatSprintLevelLabel(type.value, level);
              const isCurrentSelection = type.value === highlightedType;
              return (
                <div
                  key={type.value}
                  className={cn(
                    'flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs',
                    isCurrentSelection ? 'bg-indigo-50 border border-indigo-100' : 'border border-transparent'
                  )}
                >
                  <span className={cn('font-semibold', isCurrentSelection ? 'text-indigo-700' : 'text-slate-500')}>
                    {type.label}
                  </span>
                  <span className={cn('font-bold tabular-nums', isCurrentSelection ? 'text-indigo-700' : 'text-slate-700')}>
                    {levelLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5 pt-3 border-t border-slate-100">
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Recent Lesson Sprints</p>
          {recentSprints.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Zap size={20} className="text-slate-300 mb-2" />
              <p className="text-xs font-semibold text-slate-400">No sprints yet</p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {recentSprints.map((item) => {
                const typeLabel = QUESTION_TYPES[item.question_type as SprintQuestionType]?.label ?? item.question_type;
                return (
                  <li key={item.lesson_sprint_id} className="px-3 py-2 rounded-xl border border-slate-100 bg-slate-50/60">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-700 truncate">{resolveCoachContentName(item)}</span>
                      <span className="text-[11px] font-black text-indigo-600 bg-indigo-50 rounded-full px-2 py-0.5 shrink-0">
                        {item.average_score !== null ? `${item.average_score}/5` : '—'}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {typeLabel} · {formatSprintLevelLabel(item.question_type, item.difficulty_level)} · {item.time_limit_sec}s · {formatDateTimeByZone(item.insert_date, timezone, false)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
