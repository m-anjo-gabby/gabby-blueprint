import { BookOpen, Eye, Home, MessageCircle, Video, type LucideIcon } from 'lucide-react';

/**
 * アプリシェル（モバイル=ボトムタブ / PC=左サイドバー）の主要ナビゲーション定義。
 * ボトムタブとサイドバーは必ずこの配列を共有し、項目・順番・アイコンをデバイス間で一致させる。
 */

/** ナビ項目の表示可否を決める利用者の状態 */
export interface ShellNavContext {
  /** ライブセッション付き契約の有効なチケットを保持しているか */
  hasLiveSession: boolean;
  /** モニター（顧客担当者）ロールを保持しているか */
  isMonitor: boolean;
}

export type ShellNavId = 'home' | 'learn' | 'live' | 'chat' | 'monitor';

export interface ShellNavItem {
  id: ShellNavId;
  /** PCサイドバー・画面タイトルと揃えた正式名称 */
  label: string;
  /** モバイルのボトムタブ用の短縮名（未指定時は label） */
  shortLabel?: string;
  href: string;
  icon: LucideIcon;
  /** このタブをアクティブ扱いにするパスの前方一致リスト */
  matchPaths: string[];
  isVisible: (ctx: ShellNavContext) => boolean;
}

export const SHELL_NAV_ITEMS: ShellNavItem[] = [
  {
    id: 'home',
    label: 'ホーム',
    href: '/dashboard',
    icon: Home,
    matchPaths: ['/dashboard'],
    isVisible: () => true,
  },
  {
    id: 'learn',
    label: '学習',
    href: '/library',
    icon: BookOpen,
    // 学習記録・履歴・ダイアログ課題（シェル内のトレーニング画面）も学習タブ配下として扱う
    matchPaths: ['/library', '/favorites', '/training/performance', '/training/word/history', '/training/sprint/history', '/training/dialogue'],
    isVisible: () => true,
  },
  {
    // アプリのみの契約者にもアップセル導線として表示する（/live-room 側で紹介画面に切り替え）
    id: 'live',
    label: 'ライブセッション',
    shortLabel: 'ライブ',
    href: '/live-room',
    icon: Video,
    matchPaths: ['/live-room', '/calendar', '/coach-matching'],
    isVisible: () => true,
  },
  {
    id: 'chat',
    label: 'チャット',
    href: '/chat',
    icon: MessageCircle,
    matchPaths: ['/chat'],
    isVisible: (ctx) => ctx.hasLiveSession,
  },
  {
    id: 'monitor',
    label: 'モニター',
    href: '/monitor',
    icon: Eye,
    matchPaths: ['/monitor'],
    isVisible: (ctx) => ctx.isMonitor,
  },
];

export const getVisibleNavItems = (ctx: ShellNavContext): ShellNavItem[] =>
  SHELL_NAV_ITEMS.filter((item) => item.isVisible(ctx));

export const isNavItemActive = (item: ShellNavItem, pathname: string): boolean =>
  item.matchPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
