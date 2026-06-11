// apps/student/app/(public)/auth/callback/route.ts
import { NextResponse } from 'next/server'
import { createServerClient } from '@gabby/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)

  const code = searchParams.get('code')
  const token = searchParams.get('token')
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
     * 💡 既存の重要フロー：完全無修正でそのまま残し、機能影響をゼロにします
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
     * 招待メール (invite)
     * 💡 移行メモ: 独自招待フローは直接 /auth/invite ページがクエリパラメータを受け取るため
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