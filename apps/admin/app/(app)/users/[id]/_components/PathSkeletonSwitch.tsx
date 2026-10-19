'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { getUserDetailTabFromPath, type UserDetailTab } from '../_lib/tabs';

/**
 * 表示中のパスで骨組みを出し分ける（1つの loading.tsx が複数の画面を受け持つため）。
 * 骨組みはサーバー側で描いて渡す（翻訳・サーバー部品の骨組みをそのまま使うため）。
 */
export function UserTabSkeletonSwitch({ skeletons }: { skeletons: Record<UserDetailTab, ReactNode> }) {
  return skeletons[getUserDetailTabFromPath(usePathname())];
}

/** /users（一覧）と /users/[id] 配下（詳細）の出し分け */
export function UsersRouteSkeletonSwitch({ list, detail }: { list: ReactNode; detail: ReactNode }) {
  const isDetail = usePathname().split('/').filter(Boolean).length >= 2;
  return isDetail ? detail : list;
}
