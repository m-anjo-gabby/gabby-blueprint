'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Menu, X, LogOut, User, ChevronRight,
  PanelLeftClose, PanelLeftOpen, ChevronDown,
} from 'lucide-react';
import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { useChatStore } from '@gabby/lib/stores/useChatStore';
import { getProfileIconUrl } from '@gabby/lib/profile/getProfileIconUrl';
import { signOut } from '@/actions/coachAuthAction';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { COACH_NAV_CONFIG, type NavItem, type NavLeaf, type NavGroup } from '@/lib/navigation';

// ============================================================
// サブコンポーネント
// ============================================================

interface LeafItemProps {
  item: NavLeaf;
  isCollapsed: boolean;
  isActive: boolean;
  onClick: () => void;
  /** グループ子メニューとして表示する場合は true */
  isChild?: boolean;
  /** 未読件数などのバッジ表示（チャット等） */
  badge?: number;
}

function LeafItem({ item, isCollapsed, isActive, onClick, isChild = false, badge }: LeafItemProps) {
  const Icon = item.icon;
  const hasBadge = Boolean(badge && badge > 0);
  return (
    <li className="list-none group relative">
      <Link
        href={item.href}
        onClick={onClick}
        className={`
          flex items-center rounded-xl transition-all duration-200 text-sm font-bold
          ${isCollapsed ? 'justify-center py-3 px-0' : isChild ? 'justify-between px-3 py-2.5' : 'justify-between px-4 py-3'}
          ${isActive
            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
            : isChild
              ? 'hover:bg-slate-800/60 hover:text-white'
              : 'hover:bg-slate-800 hover:text-white'
          }
        `}
      >
        <div className={`flex items-center transition-all duration-300 ${isCollapsed ? 'justify-center gap-0' : 'justify-start gap-3'}`}>
          <span className="relative shrink-0">
            <Icon
              size={isChild ? 15 : 18}
              className={isActive ? 'text-white' : 'text-slate-500 group-hover:text-indigo-400'}
            />
            {hasBadge && isCollapsed && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-rose-500" />
            )}
          </span>
          <span className={`
            text-sm font-bold transition-all duration-300 ease-in-out whitespace-nowrap overflow-hidden
            ${isCollapsed ? 'w-0 opacity-0 ml-0' : isChild ? 'w-36 opacity-100 ml-0 text-[13px]' : 'w-40 opacity-100 ml-3'}
          `}>
            {item.label}
          </span>
        </div>
        {!isCollapsed && hasBadge && (
          <span className="min-w-5 h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center">
            {badge && badge > 99 ? '99+' : badge}
          </span>
        )}
        {isActive && !isCollapsed && !hasBadge && <ChevronRight size={14} className="text-indigo-200" />}
      </Link>

      {/* 折りたたみ時のツールチップ */}
      {isCollapsed && (
        <div className="fixed left-20 ml-2 top-auto group-hover:-translate-y-10 px-3 py-2 bg-slate-800 text-white text-[11px] font-bold rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 whitespace-nowrap z-[100] border border-slate-700 shadow-2xl">
          {item.label}
          <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-slate-800 rotate-45 border-l border-b border-slate-700" />
        </div>
      )}
    </li>
  );
}

// ------------------------------------------------------------

interface GroupItemProps {
  item: NavGroup;
  isCollapsed: boolean;
  currentPathname: string;
  onLinkClick: () => void;
}

function GroupItem({ item, isCollapsed, currentPathname, onLinkClick }: GroupItemProps) {
  const Icon = item.icon;
  const isAnyChildActive = item.children.some((child) => currentPathname.startsWith(child.href));
  const [isOpen, setIsOpen] = useState(isAnyChildActive);

  if (isCollapsed) {
    return (
      <li className="list-none group relative">
        <button
          className={`
            flex justify-center items-center w-full rounded-xl py-3 transition-all duration-200
            ${isAnyChildActive ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 text-slate-500 hover:text-white'}
          `}
          title={item.label}
        >
          <Icon size={18} className={isAnyChildActive ? 'text-white' : 'text-slate-500 group-hover:text-indigo-400'} />
        </button>
        <div className="fixed left-20 ml-2 top-auto -translate-y-8 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all duration-200 z-[100]">
          <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl p-2 min-w-[160px]">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-2 pb-1.5">{item.label}</p>
            {item.children.map((child) => (
              <Link
                key={child.href}
                href={child.href}
                onClick={onLinkClick}
                className={`
                  flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors
                  ${currentPathname.startsWith(child.href) ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'}
                `}
              >
                <child.icon size={13} />
                {child.label}
              </Link>
            ))}
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="list-none">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className={`
          flex items-center justify-between w-full px-4 py-3 rounded-xl transition-all duration-200 text-sm font-bold
          ${isAnyChildActive ? 'text-indigo-400' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}
        `}
      >
        <div className="flex items-center gap-3">
          <Icon size={18} className={isAnyChildActive ? 'text-indigo-400' : 'text-slate-500'} />
          <span className="whitespace-nowrap overflow-hidden text-sm font-bold">{item.label}</span>
        </div>
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''} ${isAnyChildActive ? 'text-indigo-400' : 'text-slate-600'}`}
        />
      </button>

      <ul
        className={`
          overflow-hidden transition-all duration-200 ease-in-out
          ${isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}
        `}
      >
        <div className="ml-4 pl-4 border-l border-slate-700/60 space-y-0.5 py-1">
          {item.children.map((child) => (
            <LeafItem
              key={child.href}
              item={child}
              isCollapsed={false}
              isActive={currentPathname.startsWith(child.href)}
              onClick={onLinkClick}
              isChild
            />
          ))}
        </div>
      </ul>
    </li>
  );
}

// ============================================================
// メインコンポーネント
// ============================================================

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();
  const user = useUserStore((state) => state.user);
  const userRoles: string[] = user?.app_metadata?.roles || [];
  const profileIconUrl = getProfileIconUrl(user?.icon_path);
  const { showConfirm } = useConfirm();
  const totalUnreadCount = useChatStore((state) => state.totalUnreadCount);
  const fetchChatRooms = useChatStore((state) => state.fetchRooms);

  useEffect(() => {
    fetchChatRooms();
  }, [fetchChatRooms]);

  const toggleMobileSidebar = () => setIsOpen(!isOpen);
  const toggleCollapse = () => setIsCollapsed(!isCollapsed);

  const handleSignOut = async () => {
    const ok = await showConfirm(
      'Confirm Logout',
      'This will end your session and log you out. Are you sure?',
      { variant: 'danger', isModal: true }
    );
    if (ok) await signOut();
  };

  // 権限に基づいて表示するメニューを決定
  const filteredNavItems = COACH_NAV_CONFIG.filter((item: NavItem) => {
    if (userRoles.includes('admin')) return true;
    if (item.requiredRoles.length === 0) return true;
    return item.requiredRoles.some((role) => userRoles.includes(role));
  });

  return (
    <>
      {/* モバイル用ハンバーガー */}
      <button
        onClick={toggleMobileSidebar}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-slate-900 text-white rounded-xl shadow-2xl border border-slate-700/50"
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 lg:hidden" onClick={toggleMobileSidebar} />
      )}

      {/* サイドバー本体 */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 bg-slate-900 text-slate-300 flex flex-col transition-all duration-300 ease-in-out border-r border-slate-800
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:inset-auto
        ${isCollapsed ? 'lg:w-20' : 'lg:w-64'}
      `}>

        {/* ロゴエリア & 折りたたみボタン */}
        <div className={`p-6 border-b border-slate-800 shrink-0 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
          {!isCollapsed && (
            <div className="flex items-center gap-3 animate-in fade-in duration-500">
              <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black italic shadow-lg shadow-indigo-500/20">B</div>
              <div className="flex flex-col">
                <span className="text-white font-black tracking-tighter text-xl leading-none">Blueprint</span>
                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Coach</span>
              </div>
            </div>
          )}
          <button
            onClick={toggleCollapse}
            className="hidden lg:flex p-1.5 hover:bg-slate-800 rounded-lg text-slate-500 transition-colors"
          >
            {isCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
          </button>
        </div>

        {/* ナビゲーション */}
        <nav className="flex-1 p-4 overflow-x-hidden overflow-y-auto scrollbar-hide space-y-1">
          {filteredNavItems.map((item: NavItem) => {
            if (item.type === 'group') {
              return (
                <GroupItem
                  key={item.label}
                  item={item}
                  isCollapsed={isCollapsed}
                  currentPathname={pathname}
                  onLinkClick={() => setIsOpen(false)}
                />
              );
            }
            return (
              <LeafItem
                key={item.href}
                item={item}
                isCollapsed={isCollapsed}
                isActive={pathname.startsWith(item.href)}
                onClick={() => setIsOpen(false)}
                badge={item.href === '/chat' ? totalUnreadCount : undefined}
              />
            );
          })}
        </nav>

        {/* アカウント・ログアウトエリア */}
        <div className="p-4 bg-slate-950/50 border-t border-slate-800 shrink-0">

          {/* ユーザー情報（クリックでプロフィール画面へ） */}
          <Link
            href="/profile"
            onClick={() => setIsOpen(false)}
            className={`
              flex items-center transition-all duration-300 mb-2 rounded-xl bg-slate-800/40 border border-slate-800/50 overflow-hidden hover:bg-slate-800/70 hover:border-slate-700
              ${isCollapsed ? 'justify-center p-2' : 'px-3 py-3 gap-3'}
            `}
          >
            <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center shrink-0 overflow-hidden">
              {profileIconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profileIconUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <User size={16} className={isCollapsed ? 'text-slate-500' : 'text-slate-300'} />
              )}
            </div>
            <div className={`
              min-w-0 flex-1 transition-all duration-300 ease-in-out whitespace-nowrap overflow-hidden
              ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}
            `}>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Account</p>
              <p className="text-xs font-bold text-slate-200 truncate">{user?.email?.split('@')[0] || 'Guest'}</p>
            </div>
          </Link>

          {/* ログアウト */}
          <button
            onClick={handleSignOut}
            className={`
              flex items-center transition-all duration-300 rounded-xl text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 text-sm font-black w-full
              ${isCollapsed ? 'justify-center py-3 gap-0' : 'px-4 py-3 gap-3'}
            `}
            title={isCollapsed ? 'Logout' : ''}
          >
            <LogOut size={18} className="shrink-0" />
            <span className={`
              transition-all duration-300 ease-in-out whitespace-nowrap overflow-hidden
              ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}
            `}>
              Logout
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}
