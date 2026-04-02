'use server';

import { 
  signInCore, 
  signOutCore, 
  forgotPasswordCore, 
  resetPasswordCore, 
  updatePasswordCore 
} from '@gabby/lib/auth/actions';
import { redirect } from 'next/navigation';

/**
 * 管理者ログイン
 * 認証後、Roleを確認して管理画面または生徒画面へ振り分けます
 */
export async function signIn(formData: FormData) {
  const { user, error } = await signInCore(formData);
  
  // 認証エラー時は呼び出し元のフォームにメッセージを返す
  if (error || !user) return { error };

  const role = user.app_metadata?.role as string | undefined;
  
  // Roleが admin の場合は管理ダッシュボードへ
  if (role === 'admin') {
    redirect('/dashboard');
  } 
  
  // 管理者でない（生徒等）が管理画面からログインした場合は、生徒用サイトへ強制移動
  const studentUrl = process.env.NEXT_PUBLIC_STUDENT_URL || '';
  redirect(`${studentUrl}/dashboard`);
}

/**
 * 管理者ログアウト
 */
export async function signOut() {
  await signOutCore();
  // 管理用ログイン画面へ戻す
  redirect('/login');
}

/**
 * パスワード再設定メール送信
 */
export async function forgotPassword(formData: FormData) {
  return await forgotPasswordCore(formData);
}

/**
 * パスワード更新（メールリンクからの復帰時）
 */
export async function resetPassword(formData: FormData) {
  const { success, error } = await resetPasswordCore(formData);
  // 更新成功時はログイン画面へ遷移（クエリで通知を表示させる運用を想定）
  if (success) redirect('/login?message=password-updated');
  return { error };
}

/**
 * プロフィール画面等からのパスワード変更
 */
export async function updatePassword(formData: FormData) {
  return await updatePasswordCore(formData);
}