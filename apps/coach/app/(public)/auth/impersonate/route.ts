import { redeemImpersonation } from '@gabby/lib/auth/impersonationRedeem';

/** 管理者代理ログイン用のマジックリンクから、対象のコーチ本人のセッションを作る（本体は redeemImpersonation） */
export async function GET(request: Request) {
  return redeemImpersonation(request, 'coach');
}
