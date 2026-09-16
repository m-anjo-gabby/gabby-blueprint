'use client';

import { HistoryList } from '@/components/common/HistoryList';
import { getLessonSprintHistoryPage } from '@/actions/lessonSprintAction';
import { formatMonthYearEn } from '@gabby/lib/date/dateEn';
import { useTimezone } from '@gabby/lib/hooks/useTimezone';
import type { LessonSprintHistoryListItem } from '@gabby/types/lessonSprint';
import { LessonSprintHistoryRow } from '../../../_components/LessonSprintHistoryRow';

const HISTORY_PAGE_SIZE = 20;
const HISTORY_BACK_LABEL = 'Back to History';

interface Props {
  studentId: string;
  initialItems: LessonSprintHistoryListItem[];
  initialCursor: string | null;
}

/**
 * その月見出しの件数・平均スコアを、現時点でクライアントに読み込み済みのアイテムだけから
 * 算出する（月をまたぐ集計専用のクエリは追加しない）。ページサイズ(20件)は月あたりの実施数
 * (最大20件程度)とほぼ同じ規模のため通常は1ページで月が閉じるが、ちょうど境界にかかった
 * 場合は「Show more」を押して読み込みが進むにつれて件数表示が増えることがある。
 */
function summarizeMonth(items: LessonSprintHistoryListItem[], monthLabel: string, timezone: string) {
  const monthItems = items.filter((it) => formatMonthYearEn(it.insert_date, timezone) === monthLabel);
  const scored = monthItems.filter((it): it is typeof it & { average_score: number } => it.average_score !== null);
  const avgScore = scored.length > 0
    ? Math.round((scored.reduce((sum, it) => sum + it.average_score, 0) / scored.length) * 10) / 10
    : null;
  return { count: monthItems.length, avgScore };
}

export function LessonSprintHistoryList({ studentId, initialItems, initialCursor }: Props) {
  const timezone = useTimezone();

  return (
    <HistoryList
      initialItems={initialItems}
      initialCursor={initialCursor}
      pageSize={HISTORY_PAGE_SIZE}
      fetchPage={(cursor, limit) => getLessonSprintHistoryPage(studentId, cursor, limit)}
      getKey={(item) => item.lesson_sprint_id}
      emptyLabel="No lesson sprint history yet."
      renderItem={(item, index, items) => {
        // 履歴は常にinsert_date降順で並ぶため、直前の行と年月表記が変わったタイミングだけ
        // 見出しを差し込めば、ページング（Show more）をまたいでも正しくグルーピングできる
        const monthLabel = formatMonthYearEn(item.insert_date, timezone);
        const prevMonthLabel = index > 0 ? formatMonthYearEn(items[index - 1].insert_date, timezone) : null;
        const isNewMonth = monthLabel !== prevMonthLabel;

        return (
          <div className={isNewMonth && index > 0 ? 'pt-2' : undefined}>
            {isNewMonth && (() => {
              const { count, avgScore } = summarizeMonth(items, monthLabel, timezone);
              return (
                <p className="sticky top-0 z-10 bg-slate-50 px-1 py-2 text-[11px] font-black text-slate-400 uppercase tracking-wider">
                  {monthLabel}
                  <span className="ml-1.5 font-bold normal-case text-slate-400/80">
                    · {count} sprint{count === 1 ? '' : 's'}
                    {avgScore !== null && ` · avg ${avgScore}/5`}
                  </span>
                </p>
              );
            })()}
            <LessonSprintHistoryRow
              studentId={studentId}
              record={item}
              backHref={`/students/${studentId}/lesson-sprint/history`}
              backLabel={HISTORY_BACK_LABEL}
            />
          </div>
        );
      }}
    />
  );
}
