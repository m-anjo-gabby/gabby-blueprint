import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { getUserById } from '@/actions/adminUserAction';
import type { UserRecord } from '@gabby/types/user';
import { getUserDetailPath, isUserDetailTabAvailable, type UserDetailTab } from './tabs';

/** ユーザー1件（layout と各タブで同じ取得を1回にまとめる） */
export const getUserDetail = cache(getUserById);

/**
 * タブのページで対象のユーザーを取得する。見つからない場合は 404、
 * 種別・登録状態で使えないタブ（URL を直接開いた等）は基本情報へ移す。
 */
export async function requireUserForTab(userId: string, tab: UserDetailTab): Promise<UserRecord> {
  const user = await getUserDetail(userId);
  if (!user) notFound();
  if (!isUserDetailTabAvailable(user, tab)) redirect(getUserDetailPath(userId));
  return user;
}
