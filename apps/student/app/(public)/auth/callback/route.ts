import { NextResponse } from 'next/server'
import { createServerClient } from '@gabby/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)

  const code = searchParams.get('code')
  const token = searchParams.get('token') // For invite and recovery (from Supabase generated link)
  const tokenHash = searchParams.get('token_hash') // For specific OTP verification (e.g., email change, if Supabase sends it)
  const type = searchParams.get('type')
  const next = searchParams.get('next') ?? '/dashboard'

  const supabase = await createServerClient()

  try {
    /**
     * PKCE フロー
     * 対象:
     * - password reset (標準フロー時)
     * - magic link
     * - email confirmation
     * */
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
     * * 【プリフェッチ対策の変更】
     * メーラーの事前読み込みによるトークン消費を防ぐため、このGETルートでは verifyOtp を行いません。
     * パラメータを保持したまま直接 /update-password 画面へリダイレクトし、クライアント側のボタンアクションで検証します。
     */
    const recoveryToken = tokenHash || token;
    if (recoveryToken && type === 'recovery') {
      // クエリパラメータを組み立ててUI画面へスルーパス
      const updatePasswordUrl = new URL(`${origin}/update-password`)
      updatePasswordUrl.searchParams.set('token_hash', recoveryToken)
      updatePasswordUrl.searchParams.set('type', 'recovery')
      if (searchParams.has('next')) {
        updatePasswordUrl.searchParams.set('next', next)
      }
      return NextResponse.redirect(updatePasswordUrl.toString())
    }

    /**
     * 招待メール (invite)
     * 移行メモ: 独自招待フローは直接 /auth/invite ページがクエリパラメータを受け取るため
     * このコールバックルートは通過しませんが、後方互換性と安全のため、元のコードブロックをそのまま維持します。
     */
    if (token && type === 'invite') {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: token,
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