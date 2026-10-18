// apps/admin/lib/navigation.ts
import type { Messages } from 'next-intl';
import {
  LayoutDashboard,
  Building2,
  FileSignature,
  Users,
  BookOpen,
  Speech,
  ShieldCheck,
  Wrench,
  BookOpenText,
  Bell,
  MessageCircle,
  Globe,
  Bot,
  Library,
  type LucideIcon,
  CalendarDays,
  CalendarRange,
  Video,
  DollarSign,
  Settings,
  LifeBuoy,
  FileChartColumn,
  Landmark,
  UserPlus,
} from 'lucide-react';

// 型定義

/** メニューの表示名の翻訳キー（messages の nav） */
export type NavLabelKey = keyof Messages['nav'];

export interface NavLeaf {
  type?: 'leaf';
  label: NavLabelKey;
  href: string;
  icon: LucideIcon;
  requiredRoles: readonly string[];
}

export interface NavGroup {
  type: 'group';
  label: NavLabelKey;
  icon: LucideIcon;
  requiredRoles: readonly string[]; // グループ自体を表示する最低権限（子の union）
  children: readonly NavLeaf[];
  /** true の場合、初期表示時にアコーディオンを開いた状態にする */
  defaultOpen?: boolean;
}

export type NavItem = NavLeaf | NavGroup;

// ナビゲーション定義

// label は "nav" 名前空間の翻訳キー（next-intl の useTranslations('nav') で解決する）
export const ADMIN_NAV_CONFIG: readonly NavItem[] = [
  {
    label: 'dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    requiredRoles: [],
  },
  {
    label: 'clients',
    href: '/clients',
    icon: Building2,
    requiredRoles: ['admin'],
  },
  {
    label: 'contracts',
    href: '/contracts',
    icon: FileSignature,
    requiredRoles: ['admin'],
  },
  {
    label: 'users',
    href: '/users',
    icon: Users,
    requiredRoles: ['admin'],
  },
  {
    label: 'trialApplications',
    href: '/trial-applications',
    icon: UserPlus,
    requiredRoles: ['admin'],
  },
  {
    label: 'contents',
    href: '/contents',
    icon: BookOpen,
    requiredRoles: ['admin', 'content_manager'],
  },
  {
    label: 'chat',
    href: '/chat',
    icon: MessageCircle,
    requiredRoles: [],
  },
  {
    label: 'liveSessions',
    href: '/live-sessions',
    icon: Video,
    requiredRoles: ['admin'],
  },
  {
    type: 'group',
    label: 'support',
    icon: LifeBuoy,
    requiredRoles: ['admin'],
    defaultOpen: true,
    children: [
      {
        label: 'notice',
        href: '/notice',
        icon: Bell,
        requiredRoles: ['admin'],
      },
      {
        label: 'calendarEvents',
        href: '/calendar-events',
        icon: CalendarDays,
        requiredRoles: ['admin'],
      },
      {
        label: 'monthlyReports',
        href: '/monthly-reports',
        icon: CalendarRange,
        requiredRoles: ['admin'],
      },
      {
        label: 'trainingReports',
        href: '/training-reports',
        icon: FileChartColumn,
        requiredRoles: ['admin'],
      },
    ],
  },
  {
    type: 'group',
    label: 'systemSettings',
    icon: Settings,
    requiredRoles: ['admin'],
    children: [
      {
        label: 'terms',
        href: '/terms',
        icon: ShieldCheck,
        requiredRoles: ['admin'],
      },
      {
        label: 'timezones',
        href: '/timezones',
        icon: Globe,
        requiredRoles: ['admin'],
      },
      {
        label: 'paymentSettings',
        href: '/payment-settings',
        icon: DollarSign,
        requiredRoles: ['admin'],
      },
      {
        label: 'companyProfiles',
        href: '/company-profiles',
        icon: Landmark,
        requiredRoles: ['admin'],
      },
    ],
  },
  {
    type: 'group',
    label: 'tools',
    icon: Wrench,
    requiredRoles: ['admin', 'content_manager'],
    children: [
      {
        label: 'ttsDesigner',
        href: '/tools/tts-designer',
        icon: Speech,
        requiredRoles: ['admin', 'content_manager'],
      },
      {
        label: 'cvDictionary',
        href: '/tools/cv-dictionary',
        icon: BookOpenText,
        requiredRoles: ['admin', 'content_manager'],
      },
      {
        label: 'aiPlayground',
        href: '/tools/ai-playground',
        icon: Bot,
        requiredRoles: ['admin', 'content_manager'],
      },
      {
        label: 'aiKnowledgeBase',
        href: '/tools/ai-knowledge-base',
        icon: Library,
        requiredRoles: ['admin', 'content_manager'],
      },
    ],
  },
] as const;

// ユーティリティ

/** 全リーフアイテムをフラットに取得 */
export function getAllLeafItems(config: readonly NavItem[]): NavLeaf[] {
  return config.flatMap((item) => (item.type === 'group' ? [...item.children] : [item]));
}

/**
 * メニューに無いが、どのロールでも開ける画面。/api は各 Route Handler がロールを確かめる（lib/adminAuth.ts）
 */
const SHARED_PATH_PREFIXES = ['/profile', '/notification', '/api/'] as const;

/**
 * 特定のパスに対して権限があるか判定する共通ロジック。メニューにも上の一覧にも無いパスは、システム管理者だけにする
 * （画面を足した時にメニューへの登録を忘れても、限られたロールに開かないようにする）
 */
export function canAccessPath(pathname: string, userRoles: string[]): boolean {
  if (userRoles.includes('admin')) return true;

  const leaves = getAllLeafItems(ADMIN_NAV_CONFIG);
  const config = leaves.find((item) => pathname.startsWith(item.href));

  if (!config) return SHARED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (config.requiredRoles.length === 0) return true;

  return config.requiredRoles.some((role) => userRoles.includes(role));
}
