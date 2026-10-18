import { z } from 'zod';
import type { useTranslations } from 'next-intl';
import { USER_STATUS, USER_TYPES, isUserType, type UserRecord } from '@gabby/types/user';

type FormT = ReturnType<typeof useTranslations<'users.form'>>;

/**
 * ユーザーの基本情報（新規登録ダイアログと詳細画面の基本情報タブで共通）。
 * エラーメッセージは翻訳に依存するため、コンポーネント内で t を渡して生成する。
 */
export function createUserBaseSchema(t: FormT) {
  return z.object({
    email: z.email({ message: t('errors.invalidEmail') }),
    user_name: z.string().min(1, t('errors.nameRequired')),
    client_id: z.string().min(1, t('errors.clientRequired')),
    user_type: z.enum([USER_TYPES.ADMIN, USER_TYPES.STUDENT, USER_TYPES.COACH], {
      message: t('errors.userTypeRequired'),
    }),
    roles: z.array(z.string()),
  });
}

export type UserBaseValues = z.infer<ReturnType<typeof createUserBaseSchema>>;

/** 新規登録: 基本情報＋作成方法（招待メール / 即時作成）・パスワード・初期ライセンス */
export function createUserCreateSchema(t: FormT) {
  return createUserBaseSchema(t)
    .extend({
      contract_id: z.string().optional(),
      creation_mode: z.enum(['invite', 'direct']),
      password: z.string().optional(),
      confirm_password: z.string().optional(),
    })
    .superRefine((data, ctx) => {
      // 生徒には初期ライセンスの割当が必須
      if (data.user_type === USER_TYPES.STUDENT && (!data.contract_id || data.contract_id === 'none')) {
        ctx.addIssue({ code: 'custom', message: t('errors.licenseRequiredForStudent'), path: ['contract_id'] });
      }

      // 即時作成の場合のみ、パスワードの入力・強度・一致を検証する
      if (data.creation_mode !== 'direct') return;
      if (!data.password || data.password.length < 8) {
        ctx.addIssue({ code: 'custom', message: t('errors.passwordTooShort'), path: ['password'] });
      } else if (!/[a-zA-Z]/.test(data.password) || !/[0-9]/.test(data.password)) {
        ctx.addIssue({ code: 'custom', message: t('errors.passwordComplexity'), path: ['password'] });
      }
      if (data.password !== data.confirm_password) {
        ctx.addIssue({ code: 'custom', message: t('errors.passwordMismatch'), path: ['confirm_password'] });
      }
    });
}

export type UserCreateValues = z.infer<ReturnType<typeof createUserCreateSchema>>;

export function toUserBaseValues(user: UserRecord): UserBaseValues {
  return {
    email: user.email ?? '',
    user_name: user.user_name ?? '',
    client_id: user.client_id ?? '',
    // com_m_user.user_type は NULL を許す列のため、種別でない値は生徒として表示する（保存時に選び直せる）
    user_type: isUserType(user.user_type) ? user.user_type : USER_TYPES.STUDENT,
    roles: user.roles ?? [],
  };
}

/** 本登録済み（招待メールのリンクから登録した、または即時作成した）か */
export function isRegisteredUser(user: Pick<UserRecord, 'last_sign_in_at' | 'confirmed_at'>): boolean {
  return !!user.last_sign_in_at || !!user.confirmed_at;
}

/** 代理ログインできるか（本登録済みで有効な生徒・コーチのみ。管理者・停止中・退会済みは対象外） */
export function canImpersonateUser(
  user: Pick<UserRecord, 'user_type' | 'last_sign_in_at' | 'confirmed_at' | 'user_status'>,
): boolean {
  return (
    (user.user_type === USER_TYPES.STUDENT || user.user_type === USER_TYPES.COACH) &&
    user.user_status === USER_STATUS.ACTIVE &&
    isRegisteredUser(user)
  );
}

/** 停止・退会の操作を出すか（ユーザーの行がある生徒・コーチ。招待中は対象外） */
export function canManageAccount(user: Pick<UserRecord, 'user_type' | 'user_status'>): boolean {
  return (user.user_type === USER_TYPES.STUDENT || user.user_type === USER_TYPES.COACH) && user.user_status !== null;
}
