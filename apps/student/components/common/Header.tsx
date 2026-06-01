'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { 
  LogOut, 
  UserIcon, 
  AlertCircle, 
  Lock, 
  FileText,
  ChevronDown, 
  Loader2
} from 'lucide-react';
import * as Dialog from "@radix-ui/react-dialog"; // Radix UI Dialogをインポート
import { motion, AnimatePresence } from 'framer-motion';

// Shadcn UI Components
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

import { useUserStore } from '@gabby/lib/stores/useUserStore';
import { signOut } from '@/actions/authAction';
import { getLatestTerms } from '@/actions/termAction';
import { TermsAgreementModal } from './TermsAgreementModal';

interface TermItem {
  term_id: string;
  term_type: string;
  version_name: string;
  storage_path: string;
}

export default function Header() {
  const user = useUserStore((state) => state.user);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [terms, setTerms] = useState<TermItem[]>([]);

  // 参照モード用に最新の規約セットを取得
  useEffect(() => {
    const fetchLatestTerms = async () => {
      const data = await getLatestTerms();
      setTerms(data as TermItem[]);
    };
    fetchLatestTerms();
  }, []);

  const handleSignOut = async () => {
    setIsSigningOut(true); // オーバーレイを表示
    try {
      await signOut();
      // 重要: router.push ではなく window.location.href を使用します。
      // これによりページが完全にリロードされ、Zustandの全メモリキャッシュ(UserAのデータ)が破棄されます。
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout failed:', error);
      setIsSigningOut(false);
      // 必要に応じてエラー通知など
    }
  };

  return (
    <>
      <header className="h-16 bg-white/70 backdrop-blur-xl border-b border-slate-200/50 px-5 flex items-center justify-between sticky top-0 z-50 shrink-0">
        {/* ロゴエリア */}
        <div className="flex items-center">
          <Image 
            src="/logo-01.png" 
            alt="Gabby Logo" 
            width={120} 
            height={32} 
            className="h-8 w-auto object-contain"
            priority 
          />
        </div>
        
        {/* ユーザー操作エリア */}
        <div className="flex items-center gap-3">
          <DropdownMenu>
            {/* ドロップダウンのトリガーボタン */}
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-full border border-slate-100 hover:bg-slate-100 transition-all outline-none active:scale-95">
                <div className="flex items-center justify-center w-6 h-6 bg-white rounded-full shadow-sm text-indigo-500">
                  <UserIcon size={14} />
                </div>
                <span className="text-xs font-bold text-slate-600 hidden sm:inline">
                  {user?.email?.split('@')[0]}
                </span>
                <ChevronDown size={12} className="text-slate-400" />
              </button>
            </DropdownMenuTrigger>
            
            {/* ドロップダウンメニュー内容 */}
            <DropdownMenuContent className="w-48 p-2 rounded-2xl shadow-xl border-slate-100" align="end">
              <DropdownMenuItem asChild>
                <Link href="/profile/password" className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer hover:bg-slate-50">
                  <Lock size={14} /> パスワード変更
                </Link>
              </DropdownMenuItem>
              
              <DropdownMenuItem 
                onSelect={(e) => {
                  e.preventDefault();
                  setShowTermsModal(true);
                }}
                className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer hover:bg-slate-50"
              >
                <FileText size={14} /> 利用規約・ポリシー
              </DropdownMenuItem>
              
              <DropdownMenuSeparator className="my-1 border-slate-100" />
              
              <DropdownMenuItem 
                onClick={() => setShowLogoutConfirm(true)} 
                className="flex items-center gap-2 text-xs font-bold text-rose-500 cursor-pointer hover:bg-rose-50 focus:bg-rose-50 focus:text-rose-600"
              >
                <LogOut size={14} /> ログアウト
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* ログアウト確認ダイアログ */}
      <AnimatePresence>
        {showLogoutConfirm && !isSigningOut && (
          <Dialog.Root open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
            <Dialog.Portal>
              {/* 背景オーバーレイ */}
              <Dialog.Overlay asChild>
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110]"
                />
              </Dialog.Overlay>
              
              {/* ダイアログ本体 */}
              <Dialog.Content 
                asChild 
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }} // yアニメーションを削除
                  animate={{ opacity: 1, scale: 1 }} // yアニメーションを削除
                  exit={{ opacity: 0, scale: 0.9 }} // yアニメーションを削除
                  transition={{ type: "spring", damping: 25, stiffness: 400 }}
                  // 画面端の余白を確保しつつ、中央に固定。デザインを以前の p-6 に戻します。
                  className="fixed left-[50%] top-[50%] z-[111] w-[calc(100%-2rem)] max-w-[280px] translate-x-[-50%] translate-y-[-50%] outline-none bg-white rounded-[32px] shadow-2xl p-6 text-center"
                >
                  <div className="flex justify-center mb-4">
                    <div className="w-12 h-12 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center">
                      <AlertCircle size={24} />
                    </div>
                  </div>
                  
                  <Dialog.Title className="text-sm font-black text-slate-800 mb-2 uppercase tracking-wider">
                    Logout
                  </Dialog.Title>
                  <Dialog.Description className="text-[11px] text-slate-500 mb-6">
                    ログアウトしてログイン画面に戻りますか？
                  </Dialog.Description>

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={handleSignOut}
                      className="w-full py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors shadow-lg shadow-rose-100 outline-none"
                    >
                      ログアウト
                    </button>
                    <button
                      onClick={() => setShowLogoutConfirm(false)}
                      className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors outline-none"
                    >
                      キャンセル
                    </button>
                  </div>
                </motion.div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        )}
      </AnimatePresence>

      {/* ローディングオーバーレイ */}
      {isSigningOut && (
        <div className="fixed inset-0 z-200 flex flex-col items-center justify-center bg-white/80 backdrop-blur-md animate-in fade-in duration-300">
          <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-4" />
          <p className="text-sm font-bold text-slate-800 animate-pulse">ログアウト中...</p>
        </div>
      )}

      {/* 利用規約・プライバシーポリシー表示（参照モード） */}
      <TermsAgreementModal 
        userId={user?.id || ''}
        terms={terms}
        mode="reference"
        isOpen={showTermsModal}
        onClose={() => setShowTermsModal(false)}
      />

    </>
  );
}