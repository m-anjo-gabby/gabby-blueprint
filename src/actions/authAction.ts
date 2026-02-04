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
    console.error('Sign-in Error:', error);
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
    console.error('Sign-out Error:', error);
    return { error: 'ログアウト中にエラーが発生しました。' };
  }

  // セッション破棄後、ログインページへリダイレクト
  redirect('/login');
}