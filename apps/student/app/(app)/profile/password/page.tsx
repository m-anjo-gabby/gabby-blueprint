// src/app/(app)/profile/password/page.tsx
'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { updatePassword } from '@/actions/authAction';
import { useToast } from '@gabby/lib/hooks/useToast';
import { PasswordInput } from '@gabby/lib/components/common/PasswordInput';
import { SubmitButton } from '@gabby/lib/components/common/SubmitButton';
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
  // 新しいパスワード関連の一般的なエラーを管理
  const [newPasswordGeneralError, setNewPasswordGeneralError] = useState<string | null>(null);
  
  const { showToast } = useToast();
  const router = useRouter();

  // 💡 新しいパスワードの強度（英数混在）判定をリアルタイムで算出
  const strengthStatus = useMemo(() => {
    if (!newPassword) return null;
    const hasAlpha = /[a-zA-Z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    return hasAlpha && hasNumber;
  }, [newPassword]);

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
    // エラーメッセージのリセット
    setCurrentPasswordError(null);
    setNewPasswordGeneralError(null);

    // 💡 1. サーバー送信前の強度チェック（文字数と英数混在）
    if (newPassword.length < 8) {
      setNewPasswordGeneralError('新しいパスワードは8文字以上で入力してください。');
      return;
    }

    if (strengthStatus === false) {
      setNewPasswordGeneralError('パスワードには英字と数字を両方含めてください。');
      return;
    }

    // 2. パスワード一致チェック
    if (matchStatus === false) {
      setNewPasswordGeneralError('新しいパスワードが一致していません。');
      return;
    }

    // 3. サーバーアクションの実行
    const result = await updatePassword(formData);

    if (result?.error) {
      // 現在のパスワード間違いはフォーム直下に表示し、そのフィールドのみリセット
      if (result.error.includes('現在のパスワード') || result.error.includes('正しくありません')) {
        setCurrentPasswordError(result.error);
        setCurrentPassword(''); // 問題箇所のみクリア
        showToast('パスワードの更新に失敗しました。', 'error'); // 現在のパスワードエラー時もトーストは出す
      } else {
        // 💡 共通コアで翻訳された「漏洩パスワード警告」や「過去と同じパスワードエラー」はトーストで綺麗に通知されます
        setNewPasswordGeneralError(result.error); // その他のエラーは新しいパスワードのインラインエラーとして表示
        showToast('パスワードの更新に失敗しました。', 'error'); // 一般的な失敗トーストも出す
      }
    } else {
      // 成功時の処理
      showToast('パスワードを正常に更新しました', 'success');
      router.push('/dashboard');
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
          <div className="space-y-1">
            <PasswordInput 
              label="新しいパスワード" 
              name="newPassword" 
              value={newPassword}
              required 
              minLength={8}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setNewPasswordGeneralError(null); // 入力開始でエラーをクリア
              }}
            />
            {/* 💡 英数混在のインラインフィードバックを追加 */}
            {strengthStatus !== null && !strengthStatus && (
              <p className="text-[11px] text-red-500 font-bold ml-1 animate-in fade-in">
                英字と数字を両方含めてください
              </p>
            )}
          </div>
          
          {/* パスワード（確認用）入力と一致確認のインラインフィードバック */}
          <div className="relative">
            <PasswordInput 
              label="新しいパスワード（確認用）" 
              name="confirmPassword" 
              value={confirmPassword}
              required 
              minLength={8}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setNewPasswordGeneralError(null); // 入力開始でエラーをクリア
              }}
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

          {/* 💡 新しいパスワード関連の一般的なエラー表示 */}
          {newPasswordGeneralError && (
            <p className="text-[11px] text-red-500 font-bold ml-1 animate-in fade-in slide-in-from-top-1">
              {newPasswordGeneralError}
            </p>
          )}

          {/* 送信ボタン：useFormStatusによる自動ローディング管理 */}
          <SubmitButton label="パスワードを更新" loadingLabel="更新中..." />

          <Link 
            href="/dashboard" 
            className="text-xs text-slate-500 hover:text-indigo-600 flex items-center justify-center gap-1 transition-colors"
          >
            <ArrowLeft size={14} /> ダッシュボードに戻る
          </Link>
        </form>
      </div>
    </div>
  );
}