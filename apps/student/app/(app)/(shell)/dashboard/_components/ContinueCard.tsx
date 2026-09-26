import Link from 'next/link';
import { Trash2 } from 'lucide-react';
import { getContentTypeConfig } from '@gabby/lib/content/ui';
import { getResumePath } from '@gabby/lib/navigation/student-path';
import type { ResumeContentResponse } from '@gabby/types/training';
import { HomeCard, ProgressBar } from './HomeCard';

interface ContinueCardProps {
  resume: ResumeContentResponse;
  onClear: () => void;
}

/** 途中の教材（ブックマーク）の再開カード（「今日やること」に別の行動が出ている場合に表示） */
export function ContinueCard({ resume, onClear }: ContinueCardProps) {
  const content = resume.com_m_contents;
  const { icon: TypeIcon, label: typeLabel, theme: typeTheme } = getContentTypeConfig(content.content_type);
  const progress = resume.metadata.display?.progress_percent ?? 0;

  return (
    <HomeCard title="続きから">
      <div className="flex items-start gap-3">
        <Link href={getResumePath(resume)} className="group flex min-w-0 flex-1 items-start gap-3">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-control ${typeTheme.iconTile}`}>
            <TypeIcon size={20} />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <p className="text-xs text-ink-muted">{typeLabel}</p>
              <p className="line-clamp-2 text-sm font-bold text-ink group-hover:text-brand-800 transition-colors">
                {content.content_name}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <ProgressBar percent={progress} />
              <span className="shrink-0 text-xs font-semibold text-ink-soft">{progress}%</span>
            </div>
          </div>
        </Link>
        <button
          type="button"
          onClick={onClear}
          aria-label="ブックマークを削除"
          className="-m-1 shrink-0 p-1 text-ink-subtle hover:text-rose-500 transition-colors"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </HomeCard>
  );
}
