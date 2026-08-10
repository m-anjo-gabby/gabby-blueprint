'use client';

import { useMemo } from 'react';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { USER_TYPES, UserType, getUserTypeLabel } from '@gabby/types/user';
import { ChatTargetUser } from '@gabby/types/chat';
import { ClientOption } from '@gabby/types/client';

const SELECTABLE_USER_TYPES: UserType[] = [USER_TYPES.ADMIN, USER_TYPES.STUDENT, USER_TYPES.COACH];

// 顧客フィルターをリセットするための「すべての顧客」選択肢
const ALL_CLIENTS_OPTION = { value: '', label: 'すべての顧客（絞り込みなし）' };

export interface ParticipantSelection {
  userType: UserType | '';
  clientId: string;
  userId: string;
}

export const EMPTY_PARTICIPANT_SELECTION: ParticipantSelection = { userType: '', clientId: '', userId: '' };

interface ParticipantPickerProps {
  label: string;
  users: ChatTargetUser[];
  clients: ClientOption[];
  value: ParticipantSelection;
  onChange: (next: ParticipantSelection) => void;
  disabled?: boolean;
}

export function ParticipantPicker({ label, users, clients, value, onChange, disabled }: ParticipantPickerProps) {
  const clientNameById = useMemo(() => new Map(clients.map((c) => [c.client_id, c.client_name])), [clients]);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (value.userType && u.user_type !== value.userType) return false;
      // 顧客での絞り込みは「生徒」選択時のみ意味を持つ（コーチ・Adminは顧客横断で活動するため）
      if (value.userType === USER_TYPES.STUDENT && value.clientId && u.client_id !== value.clientId) return false;
      return true;
    });
  }, [users, value.userType, value.clientId]);

  const userOptions = filteredUsers.map((u) => ({
    value: u.id,
    label: `${u.user_name || '（名称未設定）'}${u.client_id ? ` - ${clientNameById.get(u.client_id) || '（顧客不明）'}` : ''}`,
  }));

  return (
    <div className="space-y-2">
      <label className="text-xs font-bold text-slate-600 block">{label}</label>

      <Tabs
        value={value.userType}
        onValueChange={(nextType) => onChange({ userType: nextType as UserType, clientId: '', userId: '' })}
      >
        <TabsList className="grid grid-cols-3 w-full">
          {SELECTABLE_USER_TYPES.map((t) => (
            <TabsTrigger key={t} value={t} disabled={disabled}>
              {getUserTypeLabel(t)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {value.userType === USER_TYPES.STUDENT && (
        <SearchableSelect
          options={[ALL_CLIENTS_OPTION, ...clients.map((c) => ({ value: c.client_id, label: c.client_name }))]}
          value={value.clientId}
          onChange={(clientId) => onChange({ ...value, clientId, userId: '' })}
          placeholder="顧客で絞り込み（任意）"
          searchPlaceholder="顧客名で検索..."
          disabled={disabled}
        />
      )}

      <SearchableSelect
        options={userOptions}
        value={value.userId}
        onChange={(userId) => onChange({ ...value, userId })}
        placeholder={value.userType ? '参加者を選択してください' : '先にユーザー種別を選択してください'}
        searchPlaceholder="名前で検索..."
        emptyMessage="該当するユーザーが見つかりません。"
        disabled={disabled || !value.userType}
      />
    </div>
  );
}
