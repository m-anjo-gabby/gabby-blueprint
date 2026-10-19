import { Badge } from '@/components/ui/badge';

/**
 * 使用をやめたマスタ（is_active = false・取引終了・非公開等）に付ける目印。
 * 一覧の名前の横に置き、選択肢に出なくなったことを示す（規約は docs/DATA-DELETION.md）。
 */
export function InactiveBadge({ label }: { label: string }) {
  return (
    <Badge variant="outline" className="border-slate-300 bg-slate-100 text-[11px] font-bold text-slate-500">
      {label}
    </Badge>
  );
}
