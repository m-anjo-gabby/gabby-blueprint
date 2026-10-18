'use client';

import type { ReactNode } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Shield } from 'lucide-react';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import { getUserTypeLabel, USER_TYPES, type RoleDefinition } from '@gabby/types/user';
import type { ClientOption } from '@gabby/types/client';
import type { UserBaseValues } from '../_lib/userSchema';

export const USER_FIELD_LABEL_CLASS = 'text-xs font-bold text-slate-600';
const INPUT_CLASS = 'h-11 rounded-xl border-slate-200';

/** 種別で選べるロール（対象の種別が一致するもの、または共通ロール） */
export function filterRolesByUserType(roles: RoleDefinition[], userType: string): RoleDefinition[] {
  return roles.filter((role) => role.target_user_type === userType || role.target_user_type === null);
}

interface UserBasicFieldsProps {
  clients: ClientOption[];
  roles: RoleDefinition[];
  /** 顧客の選択肢を取得中（新規登録ダイアログは開いた時に取得する） */
  isLoadingClients?: boolean;
  /** 確認画面として、入力欄の代わりに値を表示する */
  readOnly?: boolean;
  /** すべての入力欄を無効にする（招待中のユーザー等） */
  disabled?: boolean;
  /** メールアドレスを変更不可にする（登録後は変更できない） */
  emailLocked?: boolean;
}

/**
 * ユーザーの基本情報の入力欄（メール・氏名・所属顧客・種別・ロール）。
 * 新規登録ダイアログと詳細画面の基本情報タブで共通に使い、それぞれの Form の中に置く。
 */
export function UserBasicFields({
  clients,
  roles,
  isLoadingClients = false,
  readOnly = false,
  disabled = false,
  emailLocked = false,
}: UserBasicFieldsProps) {
  const t = useTranslations('users.form');
  const tCommon = useTranslations('common');
  const form = useFormContext<UserBaseValues>();
  const userType = useWatch({ control: form.control, name: 'user_type' });
  const availableRoles = filterRolesByUserType(roles, userType);

  const renderValue = (value: ReactNode) => (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700">
      {value}
    </div>
  );

  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="email"
        render={({ field }) => (
          <FormItem>
            <FormLabel className={USER_FIELD_LABEL_CLASS}>{t('emailLabel')}</FormLabel>
            {readOnly ? (
              renderValue(field.value)
            ) : (
              <FormControl>
                <Input
                  {...field}
                  disabled={disabled || emailLocked}
                  className={INPUT_CLASS}
                  placeholder="example@domain.com"
                />
              </FormControl>
            )}
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="user_name"
        render={({ field }) => (
          <FormItem>
            <FormLabel className={USER_FIELD_LABEL_CLASS}>{t('nameLabel')}</FormLabel>
            {readOnly ? (
              renderValue(field.value)
            ) : (
              <FormControl>
                <Input {...field} disabled={disabled} className={INPUT_CLASS} placeholder={t('namePlaceholder')} />
              </FormControl>
            )}
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="client_id"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel className={USER_FIELD_LABEL_CLASS}>{t('clientLabel')}</FormLabel>
              {readOnly ? (
                renderValue(clients.find((c) => c.client_id === field.value)?.client_name || t('unselected'))
              ) : (
                <FormControl>
                  <SearchableSelect
                    options={clients.map((c) => ({ value: c.client_id, label: c.client_name }))}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder={isLoadingClients ? tCommon('loading') : t('clientPlaceholder')}
                    searchPlaceholder={t('clientSearchPlaceholder')}
                    disabled={isLoadingClients || disabled}
                  />
                </FormControl>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="user_type"
          render={({ field }) => (
            <FormItem>
              <FormLabel className={USER_FIELD_LABEL_CLASS}>{t('userTypeLabel')}</FormLabel>
              {readOnly ? (
                renderValue(getUserTypeLabel(field.value))
              ) : (
                <Select
                  onValueChange={(value) => {
                    field.onChange(value);
                    // 変更後の種別で選べないロールを外す
                    const validRoleIds = new Set(filterRolesByUserType(roles, value).map((r) => r.role_id));
                    form.setValue(
                      'roles',
                      form.getValues('roles').filter((id) => validRoleIds.has(id)),
                      { shouldDirty: true },
                    );
                  }}
                  value={field.value}
                  disabled={disabled}
                >
                  <FormControl>
                    <SelectTrigger className={INPUT_CLASS}>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={USER_TYPES.STUDENT}>{getUserTypeLabel(USER_TYPES.STUDENT)}</SelectItem>
                    <SelectItem value={USER_TYPES.ADMIN}>{getUserTypeLabel(USER_TYPES.ADMIN)}</SelectItem>
                    <SelectItem value={USER_TYPES.COACH}>{getUserTypeLabel(USER_TYPES.COACH)}</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {availableRoles.length > 0 && (
        <FormField
          control={form.control}
          name="roles"
          render={({ field }) => (
            <FormItem className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-center gap-2">
                <Shield size={14} className="text-brand-500" />
                <FormLabel className={USER_FIELD_LABEL_CLASS}>
                  {userType === USER_TYPES.ADMIN ? t('adminRoleSectionTitle') : t('permissionSectionTitle')}
                </FormLabel>
              </div>
              {readOnly ? (
                <div className="flex flex-wrap gap-2">
                  {field.value.length > 0 ? (
                    field.value.map((roleId) => (
                      <span
                        key={roleId}
                        className="rounded-md border border-brand-200 bg-brand-100 px-2.5 py-1 text-[11px] font-bold text-brand-strong"
                      >
                        {roles.find((r) => r.role_id === roleId)?.role_name}
                      </span>
                    ))
                  ) : (
                    <span className="text-[11px] text-slate-400">{t('noRolesSet')}</span>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 pt-1">
                  {availableRoles.map((role) => (
                    <label
                      key={role.role_id}
                      htmlFor={`user-role-${role.role_id}`}
                      className="flex cursor-pointer items-center gap-3 text-sm font-bold text-slate-600"
                    >
                      <Checkbox
                        id={`user-role-${role.role_id}`}
                        checked={field.value.includes(role.role_id)}
                        disabled={disabled}
                        onCheckedChange={(checked) =>
                          field.onChange(
                            checked ? [...field.value, role.role_id] : field.value.filter((v) => v !== role.role_id),
                          )
                        }
                      />
                      {role.role_name}
                    </label>
                  ))}
                </div>
              )}
            </FormItem>
          )}
        />
      )}
    </div>
  );
}
