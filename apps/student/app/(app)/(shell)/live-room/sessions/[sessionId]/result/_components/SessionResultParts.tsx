import type { LucideIcon } from 'lucide-react';
import { ShellPageHeader } from '@/components/shell/ShellPage';

/*
 * セッション結果画面の、データに依存しない部品（画面と loading.tsx の骨組みで共有する）。
 */

/** 画面の見出し（loading.tsx の骨組みと共有する） */
export function SessionResultPageHeader() {
  return <ShellPageHeader title="セッション結果" back={{ history: '/live-room' }} />;
}

/**
 * セクション見出し（アイコンバッジ+タイトル）。コーチ向け画面と視覚言語を揃えつつ、
 * 本画面は1カラムの画面のため、コーチ側のような横幅グリッドは使わず縦積みにする。
 */
export function SectionHeading({ icon: Icon, iconClassName, title }: { icon: LucideIcon; iconClassName: string; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`flex items-center justify-center w-7 h-7 rounded-control shrink-0 ${iconClassName}`}>
        <Icon size={15} />
      </span>
      <h2 className="text-sm font-bold text-ink">{title}</h2>
    </div>
  );
}
