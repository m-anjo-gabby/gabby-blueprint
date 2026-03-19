'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Menu, 
  X, 
  LayoutDashboard, 
  Users, 
  Speech, 
  Building2, 
  FileSignature, 
  BookOpen, 
  LogOut, 
  User,
  ChevronRight
} from 'lucide-react';
import { useUserStore } from '@/stores/useUserStore';
import { signOut } from '@/actions/authAction';
import { useConfirm } from '@/hooks/useConfirm';

const NAV_ITEMS = [
  { label: 'ダッシュボード', href: '/admin/dashboard', icon: LayoutDashboard },
  { label: '顧客管理', href: '/admin/clients', icon: Building2 },
  { label: '契約管理', href: '/admin/contracts', icon: FileSignature },
  { label: 'ユーザー管理', href: '/admin/users', icon: Users },
  { label: '教材管理', href: '/admin/contents', icon: BookOpen },
  { label: 'スピーチ検証', href: '/admin/speachPoc', icon: Speech },
];

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const user = useUserStore((state) => state.user);
  const { showConfirm } = useConfirm();

  const toggleSidebar = () => setIsOpen(!isOpen);

  const handleSignOut = async () => {
    // ダイアログ表示
    const ok = await showConfirm(
      'ログアウトの確認',
      'セッションを終了してログアウトします。よろしいですか？',
      { variant: 'danger', isModal: true }
    );

    // OKの場合サインアウト
    if (ok) {
      await signOut();
    }
  };

  return (
    <>
      {/* --- モバイル用オーバーレイ & ハンバーガーボタン --- */}
      <button 
        onClick={toggleSidebar}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-slate-900 text-white rounded-xl shadow-2xl border border-slate-700/50 active:scale-95 transition-transform"
        aria-label="Menu"
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 lg:hidden animate-in fade-in duration-300" 
          onClick={toggleSidebar} 
        />
      )}

      {/* --- サイドバー本体 --- */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 text-slate-300 flex flex-col transition-transform duration-300 ease-in-out border-r border-slate-800
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:inset-auto
      `}>
        
        {/* ロゴエリア: 視認性を高めたデザイン */}
        <div className="p-6 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white font-black italic text-lg">
              B
            </div>
            <div className="flex flex-col">
              <span className="text-white font-black tracking-tighter text-xl leading-none">Blueprint</span>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Admin Panel</span>
            </div>
          </div>
        </div>

        {/* ナビゲーションエリア: flex-1 で残りの空間を埋める */}
        <nav className="flex-1 p-4 overflow-y-auto scrollbar-hide space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            // 現在のパスがアイテムのパスで始まる場合にアクティブとする（サブページ対応）
            const isActive = pathname.startsWith(item.href);
            
            return (
              <li key={item.href} className="list-none">
                <Link
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={`
                    group flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 text-sm font-bold
                    ${isActive 
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' 
                      : 'hover:bg-slate-800 hover:text-white'
                    }
                  `}
                >
                  <div className="flex items-center gap-3">
                    <Icon size={18} className={isActive ? 'text-white' : 'text-slate-500 group-hover:text-indigo-400'} />
                    {item.label}
                  </div>
                  {isActive && <ChevronRight size={14} className="text-indigo-200" />}
                </Link>
              </li>
            );
          })}
        </nav>

        {/* --- アカウント・ログアウトエリア (ヘッダーから移設) --- */}
        <div className="p-4 bg-slate-950/50 border-t border-slate-800 shrink-0">
          {/* ユーザー情報表示 */}
          <div className="flex items-center gap-3 px-3 py-3 mb-2 rounded-xl bg-slate-800/40 border border-slate-800/50">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center shrink-0">
              <User size={16} className="text-slate-300" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black text-slate-500 uppercase tracking-tighter leading-none mb-1">Signed in as</p>
              <p className="text-xs font-bold text-slate-200 truncate">{user?.email || 'Guest User'}</p>
            </div>
          </div>
          
          {/* ログアウトボタン */}
          <button 
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 transition-all duration-200 text-sm font-black"
          >
            <LogOut size={18} />
            ログアウト
          </button>
        </div>
      </aside>
    </>
  );
}