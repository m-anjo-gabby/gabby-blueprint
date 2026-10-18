import 'server-only';
import { NextResponse } from 'next/server';
import { getAuthUser, type AuthUser } from '@gabby/lib/supabase/authUser';
import { createLogger } from '@gabby/lib/logger';
import { USER_TYPES } from '@gabby/types/user';

const logger = createLogger('admin');

/** admin のロール（JWT の app_metadata.roles。本人は書き換えられない） */
export const ADMIN_ROLES = {
  /** システム管理者（全画面） */
  ADMIN: 'admin',
  /** 教材担当（教材・ツール・チャット等の限られた画面） */
  CONTENT_MANAGER: 'content_manager',
} as const;
export type AdminRole = (typeof ADMIN_ROLES)[keyof typeof ADMIN_ROLES];

/** システム管理者だけ */
export const SYSTEM_ADMIN_ONLY: readonly AdminRole[] = [ADMIN_ROLES.ADMIN];
/** 教材担当も使える（教材・ツール・チャット・ダッシュボード・自分のプロフィール等） */
export const ADMIN_OR_CONTENT_MANAGER: readonly AdminRole[] = [ADMIN_ROLES.ADMIN, ADMIN_ROLES.CONTENT_MANAGER];

/** ロールの不足でアクションを止めた（画面からは通常呼ばれない経路のため、画面の文言は用意しない） */
export class AdminAccessDeniedError extends Error {
  constructor() {
    super('admin access denied');
    this.name = 'AdminAccessDeniedError';
  }
}

/** admin の利用者で、許可されたロールのどれかを持つか（システム管理者は常に可） */
export function hasAdminRole(user: AuthUser, allowed: readonly AdminRole[]): boolean {
  if (user.app_metadata?.user_type !== USER_TYPES.ADMIN) return false;
  const roles: unknown = user.app_metadata?.roles;
  if (!Array.isArray(roles)) return false;
  return roles.includes(ADMIN_ROLES.ADMIN) || allowed.some((role) => roles.includes(role));
}

/**
 * サーバーアクションの先頭で呼び、ロールを確かめる（足りなければ例外を投げる）。
 * 入口の proxy は画面のパスでしかロールを判定できないが、サーバーアクションはどの画面からでも呼べるため、
 * 各アクションでも確かめる。多くのアクションは service_role で RLS を通らないため、ここが最後の守りになる。
 * 付け忘れは単体テスト（testing/unit/admin-action-guard.test.ts）で検出する。
 */
export async function requireAdminRole(allowed: readonly AdminRole[]): Promise<AuthUser> {
  const user = await getAuthUser();
  if (user && hasAdminRole(user, allowed)) return user;
  logger.warn('auth:admin_role_denied', 'ロールの不足でアクションを止めました', {
    userId: user?.id,
    payload: { allowed, roles: user?.app_metadata?.roles },
  });
  throw new AdminAccessDeniedError();
}

/** Route Handler 用。ロールが足りなければ 403 の応答を返す（呼び出し側はそのまま return する） */
export async function checkAdminRoleForRoute(
  allowed: readonly AdminRole[],
): Promise<{ user: AuthUser; denied: null } | { user: null; denied: NextResponse }> {
  const user = await getAuthUser();
  if (user && hasAdminRole(user, allowed)) return { user, denied: null };
  logger.warn('auth:admin_role_denied', 'ロールの不足で API を止めました', {
    userId: user?.id,
    payload: { allowed, roles: user?.app_metadata?.roles },
  });
  return { user: null, denied: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
}
