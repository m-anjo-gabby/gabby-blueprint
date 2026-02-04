'use client';

import { signOut } from '@/actions/authAction';

export default function LogoutButton() {
  const handleLogout = async () => {
    // 戻り値がある場合はここでエラーハンドリングも可能
    await signOut();
  };

  return (
    <button 
      onClick={handleLogout}
      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold transition-colors"
    >
      ログアウト
    </button>
  );
}