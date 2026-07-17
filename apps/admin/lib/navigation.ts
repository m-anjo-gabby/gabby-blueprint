// apps/admin/lib/navigation.ts
import {
  LayoutDashboard, Building2, FileSignature, Users, BookOpen,
  Speech, ShieldCheck, Wrench, BookOpenText, LucideIcon,
} from 'lucide-react';

// ============================================================
// 型定義
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
  requiredRoles: readonly string[]; // グループ自体を表示する最低権限（子の union）
  children: readonly NavLeaf[];
}

export type NavItem = NavLeaf | NavGroup;

// ============================================================
// ナビゲーション定義
// ============================================================

export const ADMIN_NAV_CONFIG: readonly NavItem[] = [
  {
    label: 'ダッシュボード',
    href: '/dashboard',
    icon: LayoutDashboard,
    requiredRoles: [],
  },
  {
    label: '顧客管理',
    href: '/clients',
    icon: Building2,
    requiredRoles: ['admin'],
  },
  {
    label: '契約管理',
    href: '/contracts',
    icon: FileSignature,
    requiredRoles: ['admin'],
  },
  {
    label: 'ユーザー管理',
    href: '/users',
    icon: Users,
    requiredRoles: ['admin'],
  },
  {
    label: '規約管理',
    href: '/terms',
    icon: ShieldCheck,
    requiredRoles: ['admin'],
  },
  {
    label: '教材管理',
    href: '/contents',
    icon: BookOpen,
    requiredRoles: ['admin', 'content_manager'],
  },
  {
    type: 'group',
    label: 'Tools',
    icon: Wrench,
    requiredRoles: ['admin', 'content_manager'],
    children: [
      {
        label: 'TTS Designer',
        href: '/tools/tts-designer',
        icon: Speech,
        requiredRoles: ['admin', 'content_manager'],
      },
      {
        label: 'CV Dictionary',
        href: '/tools/cv-dictionary',
        icon: BookOpenText,
        requiredRoles: ['admin', 'content_manager'],
      },
    ],
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

  const leaves = getAllLeafItems(ADMIN_NAV_CONFIG);
  const config = leaves.find((item) => pathname.startsWith(item.href));

  if (!config || config.requiredRoles.length === 0) return true;

  return config.requiredRoles.some((role) => userRoles.includes(role));
}