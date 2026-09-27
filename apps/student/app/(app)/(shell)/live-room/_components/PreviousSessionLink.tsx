import Link from 'next/link';
import { ChevronRight, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatSessionSlot } from '@/lib/sessionFormat';
import { SessionListItem } from '@gabby/types/session';

/**
 * 前回セッションの宿題の状況。宿題は「未登録」「本文のみ（チェックリストなし）」「チェックリストあり」の
 * 3通りがあるため、表示を分ける（チェックリストの無い宿題を「0/0 完了」のように見せない）。
 */
export type PreviousHomeworkStatus =
  | { kind: 'none' }
  | { kind: 'text'; preview: string }
  | { kind: 'checklist'; done: number; total: number };

export interface PreviousSessionSummary {
  session: SessionListItem;
  homework: PreviousHomeworkStatus;
}

function HomeworkLabel({ homework }: { homework: PreviousHomeworkStatus }) {
  switch (homework.kind) {
    case 'none':
      return <span className="text-ink-muted">宿題の登録はありません</span>;
    case 'text':
      return (
        <span className="text-ink-soft">
          <span className="font-semibold">宿題あり</span>
          {homework.preview && <span className="text-ink-muted">：{homework.preview}</span>}
        </span>
      );
    case 'checklist':
      return homework.done >= homework.total ? (
        <span className="text-ink-muted">宿題はすべて完了しています</span>
      ) : (
        <span className="font-semibold text-brand-strong tabular-nums">
          宿題 {homework.done}/{homework.total} 完了
        </span>
      );
  }
}

interface Props {
  previous: PreviousSessionSummary;
  timezone: string;
  /** embedded: 次回のセッションカードの下部に入れる / card: 次回の予定が無い時に単独のカードとして出す */
  variant: 'embedded' | 'card';
}

/** 前回のセッション結果（宿題・内容の振り返り）への導線 */
export function PreviousSessionLink({ previous, timezone, variant }: Props) {
  const slot = formatSessionSlot(previous.session.start_datetime, previous.session.end_datetime, timezone);

  return (
    <Link
      href={`/live-room/sessions/${previous.session.session_id}/result`}
      className={cn(
        'group flex items-center gap-3 transition-colors',
        variant === 'embedded'
          ? '-mx-2 rounded-control px-2 py-2 hover:bg-canvas'
          : 'rounded-card border border-line bg-surface p-4 shadow-xs hover:border-brand-200 sm:px-5'
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand-500">
        <History size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-ink-muted tabular-nums">
          {variant === 'embedded' ? `前回のセッション・${slot.date}` : `${slot.date}・${previous.session.counterpart_name} コーチ`}
        </p>
        <p className="mt-0.5 truncate text-sm">
          <HomeworkLabel homework={previous.homework} />
        </p>
      </div>
      <span className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-brand-strong">
        結果を見る
        <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
