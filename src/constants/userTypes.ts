// src/constants/userTypes.ts

export const USER_TYPE_MAP: Record<string, string> = {
  '0': '管理者',
  '1': '生徒',
  '2': 'モニター',
  // 必要に応じてここに追加
};

export const getUserTypeLabel = (type: string | null | undefined): string => {
  return USER_TYPE_MAP[type || ''] || '不明';
};