// apps/admin/app/(app)/dashboard/_components/moduleConfig.ts
import { Building2, FileSignature, Users, BookOpen, Bell, type LucideIcon } from 'lucide-react';
import type { DashboardModuleKey } from '@/actions/adminDashboardAction';

interface ModuleConfigEntry {
  href: string;
  icon: LucideIcon;
  accentClass: string;
}

/**
 * lib/navigation.ts のサイドバー定義とアイコン・遷移先を揃え、ダッシュボードからの導線に一貫性を持たせる
 * title/desc/countLabel/alertLabel は messages/{ja,en}.json の "dashboard.modules.<key>" を参照する
 */
export const DASHBOARD_MODULE_CONFIG: Record<DashboardModuleKey, ModuleConfigEntry> = {
  clients: {
    href: '/clients',
    icon: Building2,
    accentClass: 'bg-blue-50 text-blue-600 border-blue-100',
  },
  contracts: {
    href: '/contracts',
    icon: FileSignature,
    accentClass: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  },
  users: {
    href: '/users',
    icon: Users,
    accentClass: 'bg-orange-50 text-orange-600 border-orange-100',
  },
  contents: {
    href: '/contents',
    icon: BookOpen,
    accentClass: 'bg-purple-50 text-purple-600 border-purple-100',
  },
  notice: {
    href: '/notice',
    icon: Bell,
    accentClass: 'bg-rose-50 text-rose-600 border-rose-100',
  },
};

/** カードの既定表示順（DASHBOARD_MODULE_CONFIG のキー順） */
export const DASHBOARD_MODULE_ORDER = Object.keys(DASHBOARD_MODULE_CONFIG) as DashboardModuleKey[];