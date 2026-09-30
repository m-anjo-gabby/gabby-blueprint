import { BookOpen, Eye, Home, MessageCircle, Video, type LucideIcon } from 'lucide-react';

/**
 * アプリシェル（モバイル=ボトムタブ / PC=左サイドバー）の主要ナビゲーション定義。
 * ボトムタブとサイドバーは必ずこの配列を共有し、項目・順番・アイコンをデバイス間で一致させる。
 */

/** ナビ項目の表示可否を決める利用者の状態 */
export interface ShellNavContext {
  /** ライブセッション付き契約の有効なチケットを保持しているか */
  hasLiveSession: boolean;
  /**
   * 過去の契約を含め、ライブセッション付き契約が1件でもあるか。
   * false の生徒はライブ画面がアップセル導線になるため、読み込み中の骨組みの出し分けに使う（ナビ項目の判定には使わない）
   */
  hasLiveSessionContract: boolean;
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
    label: 'トレーニング',
    href: '/library',
    icon: BookOpen,
    // トレーニング記録・履歴・ダイアログ課題（シェル内のトレーニング画面）もトレーニングタブ配下として扱う
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

/**
 * モバイル（md未満）でヘッダーとボトムタブを隠し、画面を作業領域だけにするシェル内の画面。
 * チャットルームは入力欄とキーボードで縦幅を使うため、会話中はナビを出さない（一覧へは画面内の戻るで戻る）。
 */
const MOBILE_FOCUS_PATH_PATTERNS: RegExp[] = [/^\/chat\/[^/]+/];

export const isMobileFocusPath = (pathname: string): boolean =>
  MOBILE_FOCUS_PATH_PATTERNS.some((pattern) => pattern.test(pathname));

/**
 * シェルの外に置く没入画面（ドリル実施・結果、ライブ通話）のパス。
 * app/(app) 直下の没入画面のルートと一致させる（(shell) 配下の同じ接頭辞の画面と区別するため個別に判定する）。
 * ページを直接開いた直後の (app)/loading.tsx が、没入画面ならスピナー、シェルの画面ならシェル付きの骨組みを出し分けるのに使う。
 */
const IMMERSIVE_PATH_PATTERNS: RegExp[] = [
  /^\/live-room\/(?!sessions\/)[^/]+$/,
  /^\/training\/sprint\/play(\/|$)/,
  /^\/training\/sprint\/result\/[^/]+$/,
  /^\/training\/word\/(?!history(\/|$))[^/]+$/,
];

export const isImmersivePath = (pathname: string): boolean =>
  IMMERSIVE_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
