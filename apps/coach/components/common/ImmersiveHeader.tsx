'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { UserAvatar } from '@/components/common/UserAvatar';

interface Props {
  studentName: string;
  studentIconPath: string | null;
  /** 画面名。パンくず的な選択風表現は避け、視認性の高い単一のタイトルとして表示する */
  title: string;
  /** 右側の付帯情報（時間帯・スコア等、画面ごとに内容が異なるためReactNodeで受け取る） */
  info?: ReactNode;
  /** 没入モードを抜けるための唯一の導線（Overview/Hubへ戻る） */
  backHref: string;
  backLabel: string;
}

/**
 * セッションハブ・Live Sprint結果画面など、Header/Sidebarを持たない没入モード画面の先頭に置く
 * 共通ヘッダー。Setup/Player（LessonSprintApp）は独立したアプリ風カードとして既にヘッダー相当の
 * UIを内包しているため対象外（詳細はSessionHub.tsx/LessonSprintResult.tsxのコメント参照）。
 * 他画面への導線は「戻る」のみに絞り、生徒コンテキストと画面名を常時可視化することに専念する。
 */
export function ImmersiveHeader({ studentName, studentIconPath, title, info, backHref, backLabel }: Props) {
  return (
    <header className="shrink-0 border-b border-slate-200/80 bg-white/90 backdrop-blur-sm px-4 md:px-6 py-3">
      <div className="max-w-7xl mx-auto flex items-center gap-3">
        <Link
          href={backHref}
          title={backLabel}
          aria-label={backLabel}
          className="h-9 w-9 shrink-0 flex items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200/80 active:scale-95 transition-all"
        >
          <ChevronLeft size={16} strokeWidth={2.5} />
        </Link>

        <div className="flex items-center gap-2.5 min-w-0 shrink-0">
          <UserAvatar userName={studentName} iconPath={studentIconPath} size={32} />
          <p className="text-xs font-bold text-slate-500 truncate max-w-28 sm:max-w-48">{studentName}</p>
        </div>

        <div className="flex-1 min-w-0 px-2 text-center">
          <h1 className="text-sm md:text-base font-black text-slate-800 tracking-tight truncate">{title}</h1>
        </div>

        {info && <div className="shrink-0 flex items-center gap-2">{info}</div>}
      </div>
    </header>
  );
}
