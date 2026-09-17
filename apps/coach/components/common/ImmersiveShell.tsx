'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  /** falseの場合はオーバーレイ化せずchildrenをそのまま描画する（通常のHeader/Sidebar付き表示） */
  active: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Header/Sidebarを覆う固定オーバーレイでchildrenを表示する共通の没入シェル。
 * ライブセッション中（通話しながらの画面操作）に、Header/Sidebarの出入りによる
 * ちらつきを避けるための表示モードで、セッションハブ・Live Sprint等で共通利用する。
 * レイアウト（flex/overflow/paddingの違い）は呼び出し側の用途ごとにclassNameで指定する。
 */
export function ImmersiveShell({ active, children, className }: Props) {
  if (!active) return <>{children}</>;

  return (
    <div className={cn('fixed inset-0 z-40 w-full h-full bg-slate-50', className)}>
      {children}
    </div>
  );
}
