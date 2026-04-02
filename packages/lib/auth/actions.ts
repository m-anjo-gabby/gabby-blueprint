// packages/lib/auth/actions.ts
import { createServerClient } from '../supabase/server';
import { User } from '@supabase/supabase-js';

/**
 * 認証レスポンスの共通型
 */
export type AuthResponse = {
  error?: string;
  success?: boolean;
  user?: User;
};

/**
 * 1. ログイン（サインイン）処理
 * @param formData - email, password を含むフォームデータ
 */
export async function signInCore(formData: FormData): Promise<AuthResponse> {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'メールアドレスとパスワードを入力してください。' };
  }

  // サーバー用クライアントの生成 (Cookie管理を含む)
  const supabase = await createServerClient();
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    console.error('Auth Error (signIn):', error?.message);
    return { error: '認証情報が正しくありません。' };
  }

  return { user: data.user, success: true };
}

/**
 * 2. ログアウト処理
 */
export async function signOutCore(): Promise<AuthResponse> {
  const supabase = await createServerClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error('Auth Error (signOut):', error.message);
    return { error: 'ログアウト中にエラーが発生しました。' };
  }

  return { success: true };
}

/**
 * 3. パスワードリセットメール送信
 * @param formData - email を含むフォームデータ
 */
export async function forgotPasswordCore(formData: FormData): Promise<AuthResponse> {
  const email = formData.get('email') as string;

  if (!email) {
    return { error: 'メールアドレスを入力してください。' };
  }

  const supabase = await createServerClient();
  
  // redirectTo は環境変数等から動的に決まるため、各アプリでラップする際に指定も可能
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/update-password`,
  });

  if (error) {
    console.error('Auth Error (forgotPassword):', error.message);
    return { error: 'メールの送信に失敗しました。時間をおいて再度お試しください。' };
  }

  return { success: true };
}

/**
 * 4. パスワード更新（リセットリンクからの遷移時）
 * @param formData - password を含むフォームデータ
 */
export async function resetPasswordCore(formData: FormData): Promise<AuthResponse> {
  const password = formData.get('password') as string;

  if (!password || password.length < 6) {
    return { error: 'パスワードは6文字以上で入力してください。' };
  }

  const supabase = await createServerClient();
  
  // 現在のセッション（リセットトークン）に基づいてパスワードを更新
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    console.error('Auth Error (resetPassword):', error.message);
    return { error: 'パスワードの更新に失敗しました。リンクの有効期限が切れている可能性があります。' };
  }

  return { success: true };
}

/**
 * 5. パスワード更新（ログイン済みユーザーによる変更）
 * @param formData - currentPassword, newPassword を含むフォームデータ
 */
export async function updatePasswordCore(formData: FormData): Promise<AuthResponse> {
  const currentPassword = formData.get('currentPassword') as string;
  const newPassword = formData.get('newPassword') as string;

  if (!newPassword || newPassword.length < 6) {
    return { error: '新しいパスワードは6文字以上で入力してください。' };
  }

  const supabase = await createServerClient();

  // A. セッションの有効性を再確認
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) return { error: 'セッションがタイムアウトしました。再度ログインしてください。' };

  // B. 現在のパスワードが正しいか「再認証」を行う
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (signInError) {
    return { error: '現在のパスワードが正しくありません。' };
  }

  // C. パスワードを更新
  const { error: updateError } = await supabase.auth.updateUser({ 
    password: newPassword 
  });

  if (updateError) {
    console.error('Auth Error (updatePassword):', updateError.message);
    return { error: 'パスワードの更新に失敗しました。' };
  }

  return { success: true };
}