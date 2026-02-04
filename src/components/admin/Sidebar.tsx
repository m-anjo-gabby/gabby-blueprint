'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, LayoutDashboard, Users, Bell, MessageSquare } from 'lucide-react';

const NAV_ITEMS = [
  { label: 'ダッシュボード', href: '/admin/dashboard', icon: LayoutDashboard },
  { label: 'ユーザー管理', href: '/admin/users', icon: Users },
  { label: 'お知らせ管理', href: '/notifications', icon: Bell },
  { label: 'お問い合わせ管理', href: '/inquiries', icon: MessageSquare },
];

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  const toggleSidebar = () => setIsOpen(!isOpen);

  return (
    <>
      {/* モバイル用ハンバーガーボタン (ヘッダー外に配置) */}
      <button 
        onClick={toggleSidebar}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-slate-800 text-white rounded-md shadow-lg"
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* オーバーレイ (モバイルで開いている時のみ) */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden" 
          onClick={toggleSidebar}
        />
      )}

      {/* サイドバー本体 */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-slate-800 text-white flex flex-col transition-transform duration-300 transform
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:inset-auto
      `}>
        <div className="p-6 text-xl font-bold border-b border-slate-700 tracking-wider flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-500 rounded flex items-center justify-center text-xs">G</div>
          GABBY CMS
        </div>
        <nav className="flex-1 p-4 overflow-y-auto">
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setIsOpen(false)} // 遷移時に閉じる
                    className={`flex items-center gap-3 px-4 py-3 rounded-md transition-colors text-sm font-medium ${
                      isActive ? 'bg-indigo-600 text-white' : 'hover:bg-slate-700 text-slate-300'
                    }`}
                  >
                    <Icon size={18} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
    </>
  );
}