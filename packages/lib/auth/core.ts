/**
 * 認証の共通処理（サーバー専用）
 *
 * 💡 このモジュールは 'use server' を付けない。付けると export した関数がすべて外部から直接呼べる
 * エンドポイントになり、ポータルごとの利用者チェック等を迂回されるため。
 * ブラウザから呼ぶ入口は、各アプリの *AuthAction.ts（createPortalAuthActions）だけにする。
 */
import 'server-only';
import { createServerClient } from '../supabase/server';
import { createAdminClient } from '../supabase/admin';
import { User } from '@supabase/supabase-js';
import { UserBase, USER_TYPES } from '@gabby/types/user';
import { createLogger } from '../logger';
import { getLogContext } from '../logger/context';
import { issueInitialLicense, resolvePerformedBy } from '../license/issue';
import { sendPasswordResetEmail } from '../mail/actions/sendPasswordReset';
import type { PasswordResetMailLanguage } from '../mail/templates/PasswordResetEmailTemplate';
import { getPasswordStrengthErrorCode } from './validation';
import { AUTH_ERROR_MESSAGES_JA, formatAuthErrorMessage, type AuthErrorCode } from './errors';
import { clearRecoveryMarker, hasValidRecoveryMarker, setRecoveryMarker } from './recovery';

// 💡 共通認証モジュールとしてのロガーを生成
const logger = createLogger('common');

/**
 * 認証レスポンスの共通型
 */
export type AuthResponse = {
  /** 日本語の既定文言（portalActions で各アプリの表示言語の文言に置き換える） */
  error?: string;
  /** エラー種別。文言の出し分けや、どの入力欄に出すかの判定に使う */
  errorCode?: AuthErrorCode;
  /** 原因究明用の補足（Supabaseの生メッセージ等）。文言の末尾に付与される */
  errorDetail?: string;
  success?: boolean;
  user?: User;
};

/** エラー応答を組み立てる（既定の日本語文言を付けておく） */
function authErrorResponse(code: AuthErrorCode, detail?: string): AuthResponse {
  return {
    error: formatAuthErrorMessage(AUTH_ERROR_MESSAGES_JA[code], detail),
    errorCode: code,
    errorDetail: detail,
  };
}

function authErrorFields(code: AuthErrorCode): { errorCode: AuthErrorCode; error: string } {
  return { errorCode: code, error: AUTH_ERROR_MESSAGES_JA[code] };
}

/**
 * 🔒 Supabaseからのエラーメッセージをエラー種別に振り分ける共通関数
 */
function translateAuthError(message: string): AuthResponse {
  const lowerMsg = message.toLowerCase();
  
  // 同一パスワードの再利用制限
  if (lowerMsg.includes('different from the old')) {
    return authErrorResponse('password_same_as_old');
  }
  
  // 1. 漏洩検知（HIBP: Have I Been Pwned 等）
  if (lowerMsg.includes('leaked') || lowerMsg.includes('pwned') || lowerMsg.includes('compromised')) {
    return authErrorResponse('password_leaked');
  }

  // 2. 脆弱性・推測のしやすさ（Weak / Common / Guessable）
  if (
    lowerMsg.includes('common') || 
    lowerMsg.includes('weak') || 
    lowerMsg.includes('easy to guess')
  ) {
    return authErrorResponse('password_weak');
  }

  // セッション欠落（本番環境でのCookie不整合や期限切れなど）
  if (lowerMsg.includes('session missing')) {
    return authErrorResponse('session_invalid');
  }
  
  // 想定外のエラー時は、原因究明のために生のメッセージを付与して返却
  return authErrorResponse('password_update_failed', message);
}

/**
 * 1. ログイン（サインイン）処理
 * @param formData - email, password を含むフォームデータ
 * @param options.checkLicense - ライセンス検証を強制する場合に true
 */
export async function signInCore(
  formData: FormData, 
  options: { checkLicense?: boolean } = { checkLicense: false }
): Promise<AuthResponse> {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return authErrorResponse('missing_credentials');
  }

  // 役割ごとに2つのクライアントを使い分ける
  const supabase = await createServerClient(); // ブラウザ・セッション管理（クッキー操作用）
  const supabaseAdmin = createAdminClient();  // ロック制御用（SQLでanon権限を剥奪したRPCを叩く用）

  // -------------------------------------------------------------
  // 🔒 1. ログイン試行前のロックアウトチェック
  // -------------------------------------------------------------
  // セキュアなRPC（get_user_lock_status_by_email）経由で、
  // auth.usersのemailを元に com_m_user のロック状態を取得
  // SQL側でanon権限を剥奪したため、ここだけ supabaseAdmin を使用してセキュアに実行します
  const { data: rpcData, error: masterError } = await supabaseAdmin
    .rpc('get_user_lock_status_by_email', { p_email: email })
    .maybeSingle();

  // 取得した rpcData を安全な型としてアサーション
  const userMaster = rpcData as {
    id: string;
    user_type: string;
    login_failed_count: number;
    locked_until: string | null;
  } | null;

  if (masterError) {
    // 💡 console.error から共通ロガーへ統合
    logger.error('auth:master_fetch_failed', masterError.message, { payload: { email } });
  }

  // ロック日時が設定されており、それが現在時刻より未来であればログインを水際で拒否
  if (userMaster && userMaster.locked_until && new Date(userMaster.locked_until) > new Date()) {
    logger.warn('auth:login_blocked_lockedout', `Locked user attempted login: ${email}`, {
      userId: userMaster.id,
      payload: { email, lockedUntil: userMaster.locked_until }
    });
    return authErrorResponse('account_locked');
  }

  // -------------------------------------------------------------
  // 2. Supabase Authでサインイン試行
  // -------------------------------------------------------------
  const { data, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  // -------------------------------------------------------------
  // 🔒 3. ログイン失敗時のハンドル（カウントアップ & ロック適用）
  // -------------------------------------------------------------
  if (authError || !data.user) {
    // 💡 エラーログをロガー経由で出力。機密情報（パスワード）を避けてエラーメッセージのみ追跡
    logger.warn('auth:supabase_signin_failed', authError?.message || 'Invalid credentials', {
      payload: { email }
    });

    // RPC経由でユーザーが特定できている場合のみ、失敗カウントの更新を行う
    if (userMaster) {
      // 管理者('0')は3回、それ以外（生徒等）は10回でロック
      const maxAttempts = userMaster.user_type === USER_TYPES.ADMIN ? 3 : 10;
      
      // RLSを回避するため、SQL側のセキュアな関数(RPC)を呼び出してカウントアップさせる
      // カウントアップ処理もSQL側で service_role 専用にしたため、supabaseAdmin を使用して安全に実行します
      const { error: updateError } = await supabaseAdmin.rpc('increment_login_failed_count', {
        p_user_id: userMaster.id,
        p_max_attempts: maxAttempts
      });

      if (updateError) {
        logger.error('auth:increment_counter_failed', updateError.message, {
          userId: userMaster.id,
          payload: { email }
        });
      }

      // 次の回数が上限に達するか判定（画面表示用のメッセージ制御）
      const nextFailedCount = (userMaster.login_failed_count || 0) + 1;
      if (nextFailedCount >= maxAttempts) {
        logger.warn('auth:account_lockedout', `Account has been locked out for 30 minutes: ${email}`, {
          userId: userMaster.id,
          payload: { email, failedCount: nextFailedCount }
        });
        return authErrorResponse('account_locked_now');
      }
    }

    return authErrorResponse('invalid_credentials');
  }

  // -------------------------------------------------------------
  // 🔒 4. ログイン成功時のハンドル（失敗カウント・ロックのリセット）
  // -------------------------------------------------------------
  // 過去に失敗履歴がある、またはロック日時が残っている場合はクリーンにクリアする
  // 💡 login_failed_count / locked_until は権限昇格防止のため authenticated ロールの
  // 列単位UPDATE権限から除外している（com_m_user.sql参照）。セッションクライアント(supabase)
  // では更新できないため、ここは supabaseAdmin(service_role) 経由で実行する。
  if (userMaster && (userMaster.login_failed_count > 0 || userMaster.locked_until)) {
    const { error: resetError } = await supabaseAdmin
      .from('com_m_user')
      .update({
        login_failed_count: 0,
        locked_until: null,
        update_date: new Date().toISOString()
      } as Partial<UserBase>)
      .eq('id', userMaster.id);

    if (resetError) {
      logger.error('auth:reset_counter_failed', resetError.message, {
        userId: data.user.id,
        email: data.user.email
      });
    }
  }

  // -------------------------------------------------------------
  // 5. ライセンスチェックが必要な場合のガード
  // -------------------------------------------------------------
  if (options.checkLicense) {
    const isLicensed = await checkLicense(data.user.id);
    if (!isLicensed) {
      logger.warn('auth:license_guard_triggered', `Licensed access denied for user: ${data.user.email}`, {
        userId: data.user.id,
        email: data.user.email
      });
      // ライセンスがない場合は即座にサインアウトさせる
      await supabase.auth.signOut();
      return authErrorResponse('license_not_found');
    }
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
    logger.error('auth:supabase_signout_failed', error.message);
    return authErrorResponse('signout_failed');
  }

  return { success: true };
}

/**
 * 3. パスワードリセットメール送信
 * @param formData - email を含むフォームデータ
 */
export async function forgotPasswordCore(
  formData: FormData,
  options: { mailLanguage: PasswordResetMailLanguage }
): Promise<AuthResponse> {
  const email = formData.get('email') as string;

  if (!email) {
    return authErrorResponse('missing_email');
  }

  try {
    // 💡 改善: メール自体は独自で送るため、Supabase側からは「送信」ではなく「認証リンク（トークン）」のみを行政権限で発行させる
    const supabaseAdmin = await createAdminClient();
    
    const { data, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: {
        // 💡 既存のリダイレクト設定をそのまま引き継ぐ（認証後のパスワード入力画面パス）
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/update-password`,
      }
    });

    // 💡 未登録のメールアドレスでも成功と同じ応答を返す（登録の有無を外部から判別させない）。
    // 失敗の内容はログにだけ残す。
    if (linkError) {
      logger.warn('auth:reset_email_link_generation_failed', linkError.message, { payload: { email } });
      return { success: true };
    }

    if (!data || !data.properties?.action_link) {
      logger.error('auth:reset_email_link_empty', '生成されたアクションリンクが空です', { payload: { email } });
      return { success: true };
    }

    // 💡 修正: Supabase内部の verify エンドポイントを経由すると、非PKCE時はセッションが
    // フラグメント (#) で返りサーバーサイドの callback で取得できなくなるため、
    // 直接アプリのコールバック URL を生成してトークン (hashed_token) を渡します。
    const tokenHash = data.properties.hashed_token;
    const appResetUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?token_hash=${tokenHash}&type=recovery&next=/update-password`;

    // 独自にデザインしたリッチHTMLメールを Resend から安全に送信！
    // メールの言語はポータルごと（student: 日本語 / coach: 英語 / admin: 日英併記）
    const mailResult = await sendPasswordResetEmail({
      to: email,
      resetUrl: appResetUrl,
      language: options.mailLanguage,
    });

    if (!mailResult.success) {
      logger.error('auth:reset_email_dispatch_failed', mailResult.error || 'Unknown error', { payload: { email } });
    }

    return { success: true };

  } catch (err) {
    logger.error('auth:forgot_password_unexpected', err instanceof Error ? err.message : 'Unknown error', { payload: { email } });
    return { success: true };
  }
}

/** 現在のセッションの session_id（JWTを検証した上で取得） */
async function getCurrentSessionId(supabase: Awaited<ReturnType<typeof createServerClient>>): Promise<string | undefined> {
  const { data } = await supabase.auth.getClaims();
  const sessionId = data?.claims?.session_id;
  return typeof sessionId === 'string' ? sessionId : undefined;
}

/**
 * 再設定リンク（recovery トークン）をサーバーで確認し、再設定用のセッションを確立する
 * 💡 メーラーの事前読み込みでトークンが消費されないよう、画面のボタン操作から呼ぶ（GETでは確認しない）
 */
export async function verifyRecoveryCore(tokenHash: string): Promise<AuthResponse> {
  if (!tokenHash) return authErrorResponse('reset_link_required');

  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });

  if (error || !data.session) {
    logger.warn('auth:recovery_verify_failed', error?.message || 'No session');
    return authErrorResponse('reset_link_required');
  }

  const payload = JSON.parse(Buffer.from(data.session.access_token.split('.')[1], 'base64url').toString('utf-8'));
  if (typeof payload?.session_id !== 'string') {
    logger.error('auth:recovery_session_id_missing', 'session_id claim not found');
    return authErrorResponse('reset_link_required');
  }

  await setRecoveryMarker(payload.session_id);
  return { success: true };
}

/** 現在のセッションで再設定フォームを出してよいか（再設定リンクの確認後に画面を再読み込みした場合など） */
export async function hasRecoverySessionCore(): Promise<boolean> {
  const supabase = await createServerClient();
  return hasValidRecoveryMarker(await getCurrentSessionId(supabase));
}

/**
 * 4. パスワード更新（リセットリンクからの遷移時）
 * @param formData - password を含むフォームデータ
 */
export async function resetPasswordCore(formData: FormData): Promise<AuthResponse> {
  const password = formData.get('password') as string;

  // 💡 共通の強度バリデーションを適用（8文字以上、英数混在）
  const validationError = getPasswordStrengthErrorCode(password);
  if (validationError) {
    return authErrorResponse(validationError);
  }

  const supabase = await createServerClient();

  // 💡 再設定リンクを確認したセッションに限る。ログイン中の利用者がこの画面から
  // 現在のパスワード確認（updatePasswordCore）を迂回して変更できないようにする。
  if (!(await hasValidRecoveryMarker(await getCurrentSessionId(supabase)))) {
    logger.warn('auth:reset_password_without_recovery', 'Password reset attempted without a verified recovery link');
    return authErrorResponse('reset_link_required');
  }

  const { data: updated, error } = await supabase.auth.updateUser({ password });

  if (error) {
    logger.error('auth:reset_password_submission_failed', error.message);
    // 💡 共通のエラー翻訳ロジックを通すことで、古いパスワード制限や漏洩検知に対応
    return translateAuthError(error.message);
  }

  // 完了後はこの端末のログインを保ったまま、ダッシュボードへ進ませる（画面側で遷移）。
  // - 確認済みの印を消し、以後のパスワード変更には現在のパスワード確認（updatePasswordCore）を求める
  // - パスワードが漏れていた場合に備え、この端末以外のセッションはすべてログアウトさせる
  await clearRecoveryMarker();
  const { error: signOutError } = await supabase.auth.signOut({ scope: 'others' });
  if (signOutError) {
    logger.error('auth:reset_password_signout_others_failed', signOutError.message, { userId: updated.user?.id });
  }

  // 本人確認（再設定リンク）が済んだため、ログイン失敗の回数とロックを解除する
  // 💡 login_failed_count / locked_until はセッションクライアントでは更新できないため service_role で行う
  if (updated.user?.id) {
    const { error: unlockError } = await createAdminClient()
      .from('com_m_user')
      .update({ login_failed_count: 0, locked_until: null, update_date: new Date().toISOString() } as Partial<UserBase>)
      .eq('id', updated.user.id);
    if (unlockError) {
      logger.error('auth:reset_password_unlock_failed', unlockError.message, { userId: updated.user.id });
    }
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

  // 💡 共通の強度バリデーションを適用（8文字以上、英数混在）
  const validationError = getPasswordStrengthErrorCode(newPassword);
  if (validationError) {
    return authErrorResponse(validationError);
  }

  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) return authErrorResponse('session_timeout');

  // 💡 ログイン済みなのでログコンテキスト（IP、UAなど）を取得して紐付け
  const ctx = await getLogContext();

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (signInError) {
    logger.warn('auth:update_password_reauth_failed', 'Re-authentication failed during password change', {
      userId: user.id,
      email: user.email,
      ...ctx
    });
    return authErrorResponse('current_password_incorrect');
  }

  const { error: updateError } = await supabase.auth.updateUser({ 
    password: newPassword 
  });

  if (updateError) {
    logger.error('auth:update_password_execution_failed', updateError.message, {
      userId: user.id,
      email: user.email,
      ...ctx
    });
    // 💡 共通のエラー翻訳ロジックを通すことで、古いパスワード制限や漏洩検知に対応
    return translateAuthError(updateError.message);
  }

  return { success: true };
}

/**
 * ユーザーの有効なライセンスを確認する
 * @param userId 
 */
export async function checkLicense(userId: string): Promise<boolean> {
  const supabase = await createServerClient();
  
  const { data, error } = await supabase
    .from('com_t_user_license')
    .select('license_id')
    .eq('user_id', userId)
    .eq('status', 1)
    .gte('end_date', new Date().toISOString()) // 💡 'now()'文字列ではなく実際のISO日時を渡す（他箇所の実装と統一）
    .limit(1) // 現在有効なものと未来のものが複数ある場合を考慮し、1件でもあればOKとする
    .maybeSingle();

  if (error) {
    logger.error('auth:license_check_db_error', error.message, { userId });
  }

  return !!data && !error;
}

// =============================================================
// 独自招待テーブル（com_t_invitation）
// =============================================================

/** 招待画面に返す情報（画面に必要な項目だけ。client_id・roles 等は返さない） */
export interface InvitationSummary {
  email: string;
  userName: string | null;
}

export type VerifyInvitationResponse =
  | { valid: true; invitation: InvitationSummary }
  | { valid: false; errorCode: AuthErrorCode; error: string };

const INVITATION_COLUMNS = 'id, email, user_name, expires_at, user_type, client_id, contract_id, roles, invited_by';

/** 未使用・期限内の招待を取得する（サーバー内部用。全項目を返す） */
async function findActiveInvitation(token: string) {
  const supabase = createAdminClient();
  const { data: invite, error } = await supabase
    .from('com_t_invitation')
    .select(INVITATION_COLUMNS)
    .eq('token', token)
    .is('accepted_at', null)
    .maybeSingle();

  if (error || !invite) return { errorCode: 'invitation_invalid' as const };
  if (new Date(invite.expires_at) < new Date()) return { errorCode: 'invitation_expired' as const };
  return { invite };
}

/**
 * 6. 招待用ワンタイムトークンの事前検証（画面の初期表示用）
 * @param token - 招待状の一意な暗号トークン
 */
export async function verifyInvitationCore(token: string): Promise<VerifyInvitationResponse> {
  try {
    if (!token) return { valid: false, ...authErrorFields('invitation_invalid') };
    const result = await findActiveInvitation(token);
    if (!result.invite) return { valid: false, ...authErrorFields(result.errorCode) };
    return { valid: true, invitation: { email: result.invite.email, userName: result.invite.user_name } };
  } catch (err) {
    logger.error('auth:verify_invitation_unexpected', err instanceof Error ? err.message : 'Unknown error');
    return { valid: false, ...authErrorFields('unexpected') };
  }
}

/**
 * 7. 招待リンクからのユーザー本登録（パスワード設定・マスタ同期）処理
 */
export async function acceptInvitationCore(token: string, password: string): Promise<AuthResponse> {
  const ctx = await getLogContext();

  try {
    if (!password) return authErrorResponse('password_too_short');

    // 共通の強度バリデーション（8文字以上、英数混在）
    const validationError = getPasswordStrengthErrorCode(password);
    if (validationError) return authErrorResponse(validationError);

    // 1. トークンの厳密な有効性検証
    const verification = await findActiveInvitation(token);
    if (!verification.invite) return authErrorResponse(verification.errorCode);

    const inviteRecord = verification.invite;
    const supabase = createAdminClient();

    // 2. Supabase Auth側へ正式なログインユーザーとしてアカウントを作成
    // ※ 既存のDBトリガーにより、public.com_m_user への基本レコードの自動同期が行われます
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: inviteRecord.email,
      password: password,
      email_confirm: true, // パスワードをその場で設定しているため、確認済みフラグを立てる
      user_metadata: {
        user_name: inviteRecord.user_name,
        user_type: inviteRecord.user_type,
        client_id: inviteRecord.client_id, // 🚀 修正: ここで client_id をメタデータに渡すことで、トリガー側が初期テナントにフォールバックするのを防ぎます
        roles: inviteRecord.roles // 招待時のロールをメタデータにも同期
      }
    });

    if (authError || !authData.user) {
      logger.error('auth:accept_invite_signup_failed', authError?.message || 'User object null', { ...ctx, email: inviteRecord.email });
      return authErrorResponse('account_create_failed', authError?.message);
    }

    const newUserId = authData.user.id;

    // 3. トリガーで自動作成されたマスタレコード(com_m_user)を確定情報でアップデート
    const { error: dbUserError } = await supabase
      .from('com_m_user')
      .update({
        client_id: inviteRecord.client_id, // 🚀 修正: トリガーだけでなく、念のためここでも確定した client_id で上書き同期を保証します
        user_name: inviteRecord.user_name,
        user_type: inviteRecord.user_type,
        update_date: new Date().toISOString()
      })
      .eq('id', newUserId);

    if (dbUserError) {
      logger.error('auth:accept_invite_m_user_sync_failed', dbUserError.message, { ...ctx, userId: newUserId });
      throw dbUserError;
    }

    // 4. 招待時に紐付けられていたロールを取得して一括挿入
    const targetRoles = (inviteRecord.roles as string[]) || [];
    if (targetRoles.length > 0) {
      const { error: roleError } = await supabase
        .from('com_t_user_role')
        .insert(targetRoles.map((roleId: string) => ({
          user_id: newUserId,
          role_id: roleId
        })));

      if (roleError) {
        logger.error('auth:accept_invite_roles_insert_failed', roleError.message, { ...ctx, userId: newUserId, roles: targetRoles });
      }
    }

    // 5. 招待時に指定されたライセンスがあれば有効化（契約期間いっぱい。契約管理からの割当と同じく
    //    履歴・ライブのチケットも作る。履歴の実行者は招待したアドミン）
    if (inviteRecord.contract_id) {
      const licenseResult = await issueInitialLicense(supabase, {
        contractId: inviteRecord.contract_id,
        userId: newUserId,
        performedBy: resolvePerformedBy(inviteRecord.invited_by ?? undefined),
      }, ctx);
      if (!licenseResult.success) {
        logger.error('auth:accept_invite_license_insert_failed', licenseResult.message, { ...ctx, userId: newUserId });
      }
    }

    // 6. 最後に招待状レコードをクローズ（承認日時の記録）
    const { error: closeError } = await supabase
      .from('com_t_invitation')
      .update({
        accepted_at: new Date().toISOString(),
        update_date: new Date().toISOString()
      })
      .eq('id', inviteRecord.id);

    if (closeError) {
      logger.error('auth:accept_invite_close_record_failed', closeError.message, { ...ctx, inviteId: inviteRecord.id });
    }

    logger.info('auth:accept_invite_all_success', `User registration fully completed: ${inviteRecord.email}`, {
      ...ctx,
      userId: newUserId
    });

    return { success: true };

  } catch (err) {
    logger.error('auth:accept_invite_unexpected', err instanceof Error ? err.message : 'Unknown error', ctx);
    return authErrorResponse('unexpected');
  }
}