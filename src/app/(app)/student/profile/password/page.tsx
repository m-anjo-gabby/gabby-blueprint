// src/app/(app)/profile/password/page.tsx
'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { updatePassword } from '@/actions/authAction';
import { useToast } from '@/hooks/useToast';
import { PasswordInput } from '@/components/common/PasswordInput';
import { SubmitButton } from '@/components/common/SubmitButton';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

/**
 * パスワード変更ページ
 * ログインユーザーが自身のパスワードを更新するための画面
 */
export default function PasswordChangePage() {
  // 各フィールドの状態をステートで管理し、エラー時も入力を保持
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // 現在のパスワード検証エラーを管理
  const [currentPasswordError, setCurrentPasswordError] = useState<string | null>(null);
  
  const { showToast } = useToast();
  const router = useRouter();

  // パスワードの一致判定をリアルタイムで算出
  const matchStatus = useMemo(() => {
    if (!newPassword || !confirmPassword) return null;
    return newPassword === confirmPassword;
  }, [newPassword, confirmPassword]);

  /**
   * フォーム送信ハンドラ
   * 送信時のバリデーションと、サーバーからのレスポンスに応じた状態更新を担当
   */
  const handleSubmit = async (formData: FormData) => {
    // 1. パスワード一致チェック
    if (matchStatus === false) {
      showToast('新しいパスワードが一致していません', 'error');
      return;
    }

    // 2. エラーメッセージのリセット
    setCurrentPasswordError(null);

    // 3. サーバーアクションの実行
    const result = await updatePassword(formData);

    if (result?.error) {
      // 現在のパスワード間違いはフォーム直下に表示し、そのフィールドのみリセット
      if (result.error.includes('現在のパスワード') || result.error.includes('正しくありません')) {
        setCurrentPasswordError(result.error);
        setCurrentPassword(''); // 問題箇所のみクリア
      } else {
        // システムエラーはトーストで通知
        showToast(result.error, 'error');
      }
    } else {
      // 成功時の処理
      showToast('パスワードを正常に更新しました', 'success');
      router.push('/student/dashboard');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl shadow-slate-100 border border-slate-100">
        <h1 className="text-xl font-bold text-slate-800 mb-6">パスワード変更</h1>
        
        <form action={handleSubmit} className="space-y-6">
          {/* 現在のパスワード入力：エラー時はフィールド下部にメッセージを表示 */}
          <div className="space-y-1">
            <PasswordInput 
              label="現在のパスワード" 
              name="currentPassword" 
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required 
            />
            {currentPasswordError && (
              <p className="text-[11px] text-red-500 font-bold ml-1 animate-in fade-in">
                {currentPasswordError}
              </p>
            )}
          </div>

          {/* 新しいパスワード入力 */}
          <PasswordInput 
            label="新しいパスワード" 
            name="newPassword" 
            value={newPassword}
            required 
            minLength={6}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          
          {/* パスワード（確認用）入力と一致確認のインラインフィードバック */}
          <div className="relative">
            <PasswordInput 
              label="新しいパスワード（確認用）" 
              name="confirmPassword" 
              value={confirmPassword}
              required 
              minLength={6}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            
            {matchStatus !== null && (
              <p className={`text-[11px] font-bold mt-1 ml-1 flex items-center gap-1 animate-in fade-in ${
                matchStatus ? 'text-emerald-600' : 'text-red-500'
              }`}>
                {matchStatus ? (
                  <><CheckCircle2 size={12} /> パスワードが一致しました</>
                ) : (
                  'パスワードが一致していません'
                )}
              </p>
            )}
          </div>

          {/* 送信ボタン：useFormStatusによる自動ローディング管理 */}
          <SubmitButton label="パスワードを更新" loadingLabel="更新中..." />

          <Link 
            href="/student/dashboard" 
            className="text-xs text-slate-500 hover:text-indigo-600 flex items-center justify-center gap-1 transition-colors"
          >
            <ArrowLeft size={14} /> ダッシュボードに戻る
          </Link>
        </form>
      </div>
    </div>
  );
}