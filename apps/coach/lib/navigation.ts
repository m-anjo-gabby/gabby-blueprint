// apps/coach/lib/navigation.ts
import { LayoutDashboard, LucideIcon } from 'lucide-react';

// ============================================================
// 型定義（admin アプリと同一構造。今後の画面追加に備えて group にも対応）
// ============================================================

export interface NavLeaf {
  type?: 'leaf';
  label: string;
  href: string;
  icon: LucideIcon;
  requiredRoles: readonly string[];
}

export interface NavGroup {
  type: 'group';
  label: string;
  icon: LucideIcon;
  requiredRoles: readonly string[];
  children: readonly NavLeaf[];
}

export type NavItem = NavLeaf | NavGroup;

// ============================================================
// ナビゲーション定義
// ============================================================
// 初期構築時点ではダッシュボードのみ。担当生徒管理・レッスン管理等は今後追加予定。

export const COACH_NAV_CONFIG: readonly NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    requiredRoles: [],
  },
] as const;

// ============================================================
// ユーティリティ
// ============================================================

/** 全リーフアイテムをフラットに取得 */
export function getAllLeafItems(config: readonly NavItem[]): NavLeaf[] {
  return config.flatMap((item) =>
    item.type === 'group' ? [...item.children] : [item]
  );
}

/**
 * 特定のパスに対して権限があるか判定する共通ロジック
 */
export function canAccessPath(pathname: string, userRoles: string[]): boolean {
  if (userRoles.includes('admin')) return true;

  const leaves = getAllLeafItems(COACH_NAV_CONFIG);
  const config = leaves.find((item) => pathname.startsWith(item.href));

  if (!config || config.requiredRoles.length === 0) return true;

  return config.requiredRoles.some((role) => userRoles.includes(role));
}
