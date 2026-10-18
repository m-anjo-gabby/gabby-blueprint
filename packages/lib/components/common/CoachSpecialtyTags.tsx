import { AudioLines } from 'lucide-react';
import { CoachSpecialtyTag } from '@gabby/types/coachSpecialty';
import { cn } from '../../utils';

export interface CoachSpecialtyTagsProps {
  tags: readonly CoachSpecialtyTag[];
  /**
   * 絞り込み中の専門コード。指定すると、含まれないタグを薄く表示する
   * （生徒のコーチ選択で、なぜそのコーチが一覧に出たのかを分かりやすくする）。
   */
  highlightCodes?: ReadonlySet<string>;
  className?: string;
}

/**
 * コーチの専門の表示（ポータル共通）。得意分野（kind='skill'。発音プロ）は塗りのバッジで先頭に、
 * 分野（kind='field'）は枠線のタグで並べる。名称は呼び出し側で各ポータルの言語にして渡す（toCoachSpecialtyTags）。
 */
export function CoachSpecialtyTags({ tags, highlightCodes, className }: CoachSpecialtyTagsProps) {
  if (tags.length === 0) return null;

  const skills = tags.filter((t) => t.kind === 'skill');
  const fields = tags.filter((t) => t.kind === 'field');
  const isDimmed = (code: string) => !!highlightCodes && highlightCodes.size > 0 && !highlightCodes.has(code);

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {skills.map((tag) => (
        <span
          key={tag.code}
          className={cn(
            'inline-flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-white transition-opacity',
            isDimmed(tag.code) && 'opacity-40',
          )}
        >
          <AudioLines size={11} aria-hidden />
          {tag.label}
        </span>
      ))}
      {fields.map((tag) => (
        <span
          key={tag.code}
          className={cn(
            'rounded-full border border-brand-100 bg-brand-soft px-2 py-0.5 text-[11px] font-bold text-brand-strong transition-opacity',
            isDimmed(tag.code) && 'opacity-40',
          )}
        >
          {tag.label}
        </span>
      ))}
    </div>
  );
}
