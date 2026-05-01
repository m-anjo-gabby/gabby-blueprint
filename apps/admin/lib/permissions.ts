// 権限が必要なパスと、許可されるロールの定義
export const PERMISSION_CONFIG = {
  '/dashboard': [], // 全員（adminアプリに入れる人全員）OK
  '/clients': ['admin'],
  '/contracts': ['admin'],
  '/users': ['admin'],
  '/contents': ['admin', 'content_manager'],
  '/tools/tts-designer': ['admin', 'content_manager'],
} as const;

export type AppPath = keyof typeof PERMISSION_CONFIG;

/**
 * ユーザーが特定のパスにアクセスする権限があるか判定する共通関数
 */
export function hasPathPermission(pathname: string, userRoles: string[]): boolean {
  // adminロールを持っていれば全てのパスを許可
  if (userRoles.includes('admin')) return true;

  // パスに対応する設定を探す（前方一致）
  const entry = Object.entries(PERMISSION_CONFIG).find(([path]) =>
    pathname.startsWith(path)
  );

  // 設定がないパスは「制限なし」として扱うか、
  // あるいは安全側に倒して「ダッシュボード以外は拒否」などの運用も可能
  if (!entry) return true;

  const requiredRoles = entry[1] as readonly string[];
  
  // 必要ロールが空なら全員OK
  if (requiredRoles.length === 0) return true;

  // いずれかのロールを持っていればOK
  return requiredRoles.some((role) => userRoles.includes(role));
}