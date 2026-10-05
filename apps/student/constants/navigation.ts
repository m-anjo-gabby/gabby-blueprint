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
   * ライブセッションタブの表示条件（過去の契約の履歴を見られるようにする）と、読み込み中の骨組みの出し分けに使う
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
    // グループセッションの一覧はホームのカードから開くため、ホーム配下として扱う
    matchPaths: ['/dashboard', '/group-sessions'],
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
    // ライブセッション付き契約が1件でもある（過去の契約を含む）生徒だけに表示する。
    // アプリのみの契約者へのプランの紹介は、ホームの「ご契約プラン」の終了の案内の導線だけにする（法人契約が中心で、常時の訴求は効果が小さいため）
    id: 'live',
    label: 'ライブセッション',
    shortLabel: 'ライブ',
    href: '/live-room',
    icon: Video,
    matchPaths: ['/live-room', '/calendar', '/coach-matching'],
    isVisible: (ctx) => ctx.hasLiveSessionContract,
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

/**
 * トレーニングタブの中の切り替え（教材・お気に入り・トレーニング記録）。
 * タブの遷移先（教材）以外の画面にもホームを経由せず行き来できるよう、3画面の上部に共通で表示する。
 */
export const TRAINING_SECTION_ITEMS = [
  { href: '/library', label: '教材' },
  { href: '/favorites', label: 'お気に入り' },
  { href: '/training/performance', label: 'トレーニング記録' },
] as const;

export const isTrainingSectionPath = (pathname: string): boolean =>
  TRAINING_SECTION_ITEMS.some(({ href }) => pathname === href || pathname.startsWith(`${href}/`));

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
