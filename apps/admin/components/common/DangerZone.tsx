import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

interface DangerZoneProps {
  title: ReactNode;
  description: ReactNode;
  /** 実行のボタン（戻せない操作。押すと TypedConfirmDialog で確認する） */
  action: ReactNode;
}

/**
 * 戻せない操作（退会・顧客単位の一括削除）の区画。画面・ダイアログの最下部に置く（docs/DATA-DELETION.md）。
 */
export function DangerZone({ title, description, action }: DangerZoneProps) {
  return (
    <section className="rounded-lg border border-rose-200 bg-rose-50/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-rose-700">
            <TriangleAlert size={14} aria-hidden /> {title}
          </h3>
          <p className="text-xs text-slate-600">{description}</p>
        </div>
        {action}
      </div>
    </section>
  );
}
