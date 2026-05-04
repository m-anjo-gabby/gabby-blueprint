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
 * 生徒ログイン
 * 誤って管理者がここからログインした場合は管理画面へ転送します
 */
export async function signIn(formData: FormData) {

  // ライセンスチェックを有効化して呼び出す
  const { user, error } = await signInCore(formData, { checkLicense: true });
  
  if (error || !user) return { error };

  const userType = user.app_metadata?.user_type as string | undefined;
  
  // 管理者がログインした場合は管理サイトのダッシュボードへ転送
  if (userType === '0') {
    const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL || '';
    redirect(`${adminUrl}/dashboard`);
  } 
  
  // 通常の生徒は自身のダッシュボードへ
  redirect('/dashboard');
}

/**
 * 生徒ログアウト
 */
export async function signOut() {
  await signOutCore();
  // 生徒用ログイン画面へ
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
  if (success) redirect('/login?message=password-updated');
  return { error };
}

/**
 * 学習画面や設定画面からのパスワード変更
 */
export async function updatePassword(formData: FormData) {
  return await updatePasswordCore(formData);
}