// apps/admin/app/(app)/dashboard/_components/moduleConfig.ts
import { Building2, FileSignature, Users, BookOpen, Bell, type LucideIcon } from 'lucide-react';
import type { DashboardModuleKey } from '@/actions/adminDashboardAction';

interface ModuleConfigEntry {
  title: string;
  desc: string;
  href: string;
  icon: LucideIcon;
  accentClass: string;
}

/**
 * lib/navigation.ts のサイドバー定義とアイコン・遷移先を揃え、ダッシュボードからの導線に一貫性を持たせる
 */
export const DASHBOARD_MODULE_CONFIG: Record<DashboardModuleKey, ModuleConfigEntry> = {
  clients: {
    title: '顧客管理',
    desc: '法人・団体アカウントの管理',
    href: '/clients',
    icon: Building2,
    accentClass: 'bg-blue-50 text-blue-600 border-blue-100',
  },
  contracts: {
    title: '契約管理',
    desc: 'ライセンス発行・有効期限確認',
    href: '/contracts',
    icon: FileSignature,
    accentClass: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  },
  users: {
    title: 'ユーザー管理',
    desc: '受講生・講師の権限管理',
    href: '/users',
    icon: Users,
    accentClass: 'bg-orange-50 text-orange-600 border-orange-100',
  },
  contents: {
    title: '教材管理',
    desc: 'カリキュラム・コンテンツ更新',
    href: '/contents',
    icon: BookOpen,
    accentClass: 'bg-purple-50 text-purple-600 border-purple-100',
  },
  notice: {
    title: 'お知らせ管理',
    desc: '生徒・顧客への告知配信',
    href: '/notice',
    icon: Bell,
    accentClass: 'bg-rose-50 text-rose-600 border-rose-100',
  },
};

/** カードの既定表示順（DASHBOARD_MODULE_CONFIG のキー順） */
export const DASHBOARD_MODULE_ORDER = Object.keys(DASHBOARD_MODULE_CONFIG) as DashboardModuleKey[];