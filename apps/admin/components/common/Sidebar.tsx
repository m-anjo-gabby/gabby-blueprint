'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Menu, X, LayoutDashboard, Users, Speech, Building2, 
  FileSignature, BookOpen, LogOut, User, ChevronRight,
  PanelLeftClose, PanelLeftOpen 
} from 'lucide-react';
import { useUserStore } from '@/stores/useUserStore';
import { signOut } from '@/actions/adminAuthAction';
import { useConfirm } from '@/hooks/useConfirm';

const NAV_ITEMS = [
  { label: 'ダッシュボード', href: '/dashboard', icon: LayoutDashboard },
  { label: '顧客管理', href: '/clients', icon: Building2 },
  { label: '契約管理', href: '/contracts', icon: FileSignature },
  { label: 'ユーザー管理', href: '/users', icon: Users },
  { label: '教材管理', href: '/contents', icon: BookOpen },
  { label: 'TTS Designer', href: '/tools/tts-designer', icon: Speech },
];

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(false); // モバイル用
  const [isCollapsed, setIsCollapsed] = useState(false); // デスクトップ用折りたたみ
  const pathname = usePathname();
  const user = useUserStore((state) => state.user);
  const { showConfirm } = useConfirm();

  const toggleMobileSidebar = () => setIsOpen(!isOpen);
  const toggleCollapse = () => setIsCollapsed(!isCollapsed);

  const handleSignOut = async () => {
    const ok = await showConfirm(
      'ログアウトの確認',
      'セッションを終了してログアウトします。よろしいですか？',
      { variant: 'danger', isModal: true }
    );
    if (ok) await signOut();
  };

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
              </div>
            </div>
          )}
          {/* デスクトップ時のみ表示される切り替えボタン */}
          <button 
            onClick={toggleCollapse} 
            className="hidden lg:flex p-1.5 hover:bg-slate-800 rounded-lg text-slate-500 transition-colors"
          >
            {isCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
          </button>
        </div>

        {/* ナビゲーション */}
        <nav className="flex-1 p-4 overflow-x-hidden overflow-y-auto scrollbar-hide space-y-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname.startsWith(item.href);
            return (
              <li key={item.href} className="list-none group relative">
                <Link
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={`
                    flex items-center rounded-xl transition-all duration-200 text-sm font-bold
                    ${isCollapsed ? 'justify-center py-3 px-0' : 'justify-between px-4 py-3'}
                    ${isActive ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'hover:bg-slate-800 hover:text-white'}
                  `}
                >
                  <div className={`
                    flex items-center transition-all duration-300
                    ${isCollapsed ? 'justify-center gap-0' : 'justify-start gap-3'}
                  `}>
                    <Icon 
                      size={18} 
                      className={`shrink-0 ${isActive ? 'text-white' : 'text-slate-500 group-hover:text-indigo-400'}`} 
                    />
                    
                    <span className={`
                      text-sm font-bold transition-all duration-300 ease-in-out whitespace-nowrap overflow-hidden
                      ${isCollapsed ? 'w-0 opacity-0 ml-0' : 'w-40 opacity-100 ml-3'}
                    `}>
                      {item.label}
                    </span>
                  </div>
                  {isActive && !isCollapsed && <ChevronRight size={14} className="text-indigo-200" />}
                </Link>
                
                {/* 折りたたみ時のツールチップ */}
                {isCollapsed && (
                  <div className="fixed left-20 ml-2 top-auto group-hover:-translate-y-10 px-3 py-2 bg-slate-800 text-white text-[11px] font-bold rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 whitespace-nowrap z-100 border border-slate-700 shadow-2xl">
                    {item.label}
                    <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-slate-800 rotate-45 border-l border-b border-slate-700" />
                  </div>
                )}
              </li>
            );
          })}
        </nav>

        {/* --- アカウント・ログアウトエリア --- */}
        <div className="p-4 bg-slate-950/50 border-t border-slate-800 shrink-0">
          
          {/* ユーザー情報表示エリア */}
          <div className={`
            flex items-center transition-all duration-300 mb-2 rounded-xl bg-slate-800/40 border border-slate-800/50 overflow-hidden
            ${isCollapsed ? 'justify-center p-2' : 'px-3 py-3 gap-3'}
          `}>
            {/* アイコン部分：常に存在し、配置だけが切り替わる */}
            <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center shrink-0">
              <User size={16} className={isCollapsed ? 'text-slate-500' : 'text-slate-300'} />
            </div>

            {/* テキスト部分：CSSで幅と透明度を制御 */}
            <div className={`
              min-w-0 flex-1 transition-all duration-300 ease-in-out whitespace-nowrap overflow-hidden
              ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}
            `}>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Account</p>
              <p className="text-xs font-bold text-slate-200 truncate">{user?.email?.split('@')[0] || 'Guest'}</p>
            </div>
          </div>
          
          {/* ログアウトボタン */}
          <button 
            onClick={handleSignOut}
            className={`
              flex items-center transition-all duration-300 rounded-xl text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 text-sm font-black w-full
              ${isCollapsed ? 'justify-center py-3 gap-0' : 'px-4 py-3 gap-3'}
            `}
            title={isCollapsed ? "ログアウト" : ""}
          >
            <LogOut size={18} className="shrink-0" />
            <span className={`
              transition-all duration-300 ease-in-out whitespace-nowrap overflow-hidden
              ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}
            `}>
              ログアウト
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}