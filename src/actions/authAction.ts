'use server';

import { createClient } from '@/lib/server';
import { redirect } from 'next/navigation';

/**
 * ログイン処理を行うサーバーアクション。
 * リダイレクト制御を兼ねます。
 * * @param formData - フォームから送信されたデータ（メール、パスワード）
 */
export async function signIn(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'メールアドレスとパスワードを入力してください。' };
  }

  // 1. サーバークライアントで認証を行う
  const supabase = await createClient();
  
  // signInWithPassword は内部的に Set-Cookie ヘッダーを生成します
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    console.error('Sign-in Error:', error?.message || 'No user data');
    // エラーを返却
    return { error: '認証情報が正しくありません。' };
  }

  // 2. 認証成功: ロールに基づいたリダイレクト先の決定
  // proxy.ts と同様、JWTに含まれる app_metadata を参照して高速に判定
  const role = data.user.app_metadata?.role as string | undefined;
  
  // リダイレクト先の決定 (ロールベース)
  const targetPath = role === 'admin' ? '/admin/dashboard' : '/student/dashboard';

  // 3. 指定したダッシュボードページへリダイレクト
  // ※ redirect() は内部で例外を投げるため、関数の最後に記述します
  redirect(targetPath);
}

/**
 * ログアウト処理を行うサーバーアクション
 * SpringBoot Security の LogoutHandler に相当します。
 */
export async function signOut() {
  const supabase = await createClient();
  
  // Supabaseのセッションを破棄（Cookieも自動的にクリアされます）
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error('Sign-out Error:', error?.message || 'invalid signOut');
    return { error: 'ログアウト中にエラーが発生しました。' };
  }

  // セッション破棄後、ログインページへリダイレクト
  redirect('/login');
}

/**
 * パスワードリセット用のメールを送信するサーバーアクション
 */
export async function forgotPassword(formData: FormData) {
  const email = formData.get('email') as string;

  if (!email) {
    return { error: 'メールアドレスを入力してください。' };
  }

  const supabase = await createClient();
  
  // パスワードリセット用メール送信
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/update-password`,
  });

  if (error) {
    console.error('Reset Password Error:', error.message);
    return { error: 'メールの送信に失敗しました。時間をおいて再度お試しください。' };
  }

  return { success: true };
}

/**
 * パスワードを更新（リセット時）するサーバーアクション
 */
export async function resetPassword(formData: FormData) {
  const password = formData.get('password') as string;

  if (!password || password.length < 6) {
    return { error: 'パスワードは6文字以上で入力してください。' };
  }

  const supabase = await createClient();
  
  // サーバーサイドで認証セッションを確認しつつ更新
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    console.error('Update Password Error:', error.message);
    return { error: 'パスワードの更新に失敗しました。リンクの有効期限が切れている可能性があります。' };
  }

  return { success: true };
}

/**
 * パスワードを更新（ログイン後）するサーバーアクション
 */
export async function updatePassword(formData: FormData) {
  const currentPassword = formData.get('currentPassword') as string;
  const newPassword = formData.get('newPassword') as string;

  const supabase = await createClient();

  // 1. 現在のユーザー情報を取得
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) return { error: '未ログインです。' };

  // 2. 「現在のパスワード」が正しいか検証（ログイン試行）
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (signInError) {
    return { error: '現在のパスワードが正しくありません。' };
  }

  // 3. 検証が通ったら新しいパスワードに更新
  const { error: updateError } = await supabase.auth.updateUser({ 
    password: newPassword 
  });

  if (updateError) {
    return { error: 'パスワードの更新に失敗しました。' };
  }

  return { success: true };
}