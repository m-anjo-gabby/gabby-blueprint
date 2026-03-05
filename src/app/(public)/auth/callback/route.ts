// src/app/(app)/auth/callback/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/server'; // サーバーサイドクライアント

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createClient();
    // ここで認証コードをセッションと交換します
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // 失敗した場合はログイン画面へ
  return NextResponse.redirect(`${origin}/login`);
}