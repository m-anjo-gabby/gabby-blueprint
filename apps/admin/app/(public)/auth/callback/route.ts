// src/app/(public)/auth/callback/route.ts
import { NextResponse } from 'next/server'
import { createServerClient } from '@gabby/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)

  const code = searchParams.get('code')
  const token = searchParams.get('token')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const next = searchParams.get('next') ?? '/dashboard'

  const supabase = await createServerClient()

  try {

    /**
     * PKCE フロー
     * 対象:
     * - password reset
     * - magic link
     * - email confirmation
     */
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code)

      if (error) {
        console.error('PKCE exchange error:', error.message)
        return NextResponse.redirect(`${origin}/login?error=auth`)
      }

      return NextResponse.redirect(`${origin}${next}`)
    }

    /**
     * 独自パスワードリセットフロー (recovery)
     * generateLink({ type: 'recovery' }) で発行されたトークンを検証し、
     * 認証セッションを確立してパスワード更新画面へリダイレクトします。
     */
    // generateLink から直接 callback へ届く場合、パラメータ名は token_hash または token
    // の可能性があるため、両方をフォールバックとして受け入れます。
    const recoveryToken = tokenHash || token;
    if (recoveryToken && type === 'recovery') {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: recoveryToken,
        type: 'recovery',
      })

      if (error) {
        console.error('Password reset verify error:', error.message)
        // ログイン画面へ戻し、エラーメッセージを表示させるためのパラメータを付与
        return NextResponse.redirect(`${origin}/login?error=reset_expired`)
      }

      // トークン検証が成功すると、裏で一時的なログインセッションが張られます。
      // そのままパスワード入力画面（/update-password）へ安全にリダイレクトします。
      return NextResponse.redirect(`${origin}${next}`)
    }

    /**
     * 招待メール (invite)
     * 移行メモ: 独自招待フローは直接 /auth/invite ページがクエリパラメータを受け取るため
     * このコールバックルートは通過しませんが、後方互換性と安全のため維持します。
     */
    // invite の場合も token_hash または token の両方を考慮
    const inviteToken = tokenHash || token;
    if (inviteToken && type === 'invite') {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: inviteToken,
        type: 'invite',
      })

      if (error) {
        console.error('Invite verify error:', error.message)
        return NextResponse.redirect(`${origin}/login?error=invite`)
      }

      return NextResponse.redirect(`${origin}${next}`)
    }

    /**
     * その他 (fallback)
     */
    return NextResponse.redirect(`${origin}/login`)

  } catch (err) {
    console.error('Auth callback error:', err)
    return NextResponse.redirect(`${origin}/login?error=callback`)
  }
}