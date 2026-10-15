import { USER_TYPES, type UserRecord } from '@gabby/types/user';
import { isRegisteredUser } from '../../_lib/userSchema';

/** ユーザー詳細のタブ（並び順どおり）。basic 以外は /users/[id]/<tab> の子ルート */
export const USER_DETAIL_TABS = ['basic', 'sprint', 'specialty', 'matching', 'ratings', 'legal'] as const;
export type UserDetailTab = (typeof USER_DETAIL_TABS)[number];

type TabUser = Pick<UserRecord, 'user_type' | 'last_sign_in_at' | 'confirmed_at'>;

/** ユーザーの種別・登録状態で使えるタブか */
export function isUserDetailTabAvailable(user: TabUser, tab: UserDetailTab): boolean {
  const isStudent = user.user_type === USER_TYPES.STUDENT;
  const isCoach = user.user_type === USER_TYPES.COACH;
  switch (tab) {
    case 'basic':
      return true;
    case 'sprint':
      return isStudent;
    case 'specialty':
    case 'matching':
    case 'ratings':
      return isCoach;
    case 'legal':
      // 書面に載せる氏名は本登録済みの生徒・コーチのみ
      return (isStudent || isCoach) && isRegisteredUser(user);
  }
}

export function getUserDetailTabs(user: TabUser): UserDetailTab[] {
  return USER_DETAIL_TABS.filter((tab) => isUserDetailTabAvailable(user, tab));
}

export function getUserDetailPath(userId: string, tab: UserDetailTab = 'basic'): string {
  return tab === 'basic' ? `/users/${userId}` : `/users/${userId}/${tab}`;
}

/** 表示中のパスからタブを決める（/users/[id] 配下の読み込み中表示・タブの選択状態で使う） */
export function getUserDetailTabFromPath(pathname: string): UserDetailTab {
  const segment = pathname.split('/')[3];
  return USER_DETAIL_TABS.find((tab) => tab === segment) ?? 'basic';
}
