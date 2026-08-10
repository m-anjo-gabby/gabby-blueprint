'use client';

import { useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SearchableSelect } from '@/components/common/SearchableSelect';
import { USER_TYPES, UserType, getUserTypeLabel } from '@gabby/types/user';
import { ChatTargetUser } from '@gabby/types/chat';
import { ClientOption } from '@gabby/types/client';

const SELECTABLE_USER_TYPES: UserType[] = [USER_TYPES.ADMIN, USER_TYPES.STUDENT, USER_TYPES.COACH];

// 顧客フィルターをリセットするための「すべての顧客」選択肢
const ALL_CLIENTS_OPTION = { value: '', label: 'すべての顧客（絞り込みなし）' };

interface GroupParticipantsPickerProps {
  users: ChatTargetUser[];
  clients: ClientOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

export function GroupParticipantsPicker({ users, clients, selectedIds, onChange, disabled }: GroupParticipantsPickerProps) {
  const [userType, setUserType] = useState<UserType | ''>('');
  const [clientId, setClientId] = useState('');

  const clientNameById = useMemo(() => new Map(clients.map((c) => [c.client_id, c.client_name])), [clients]);
  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (userType && u.user_type !== userType) return false;
      // 顧客での絞り込みは「生徒」選択時のみ意味を持つ（コーチ・Adminは顧客横断で活動するため）
      if (userType === USER_TYPES.STUDENT && clientId && u.client_id !== clientId) return false;
      return true;
    });
  }, [users, userType, clientId]);

  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  return (
    <div className="space-y-2">
      <label className="text-xs font-bold text-slate-600 block">参加者（複数選択可）</label>

      <Tabs
        value={userType}
        onValueChange={(next) => {
          setUserType(next as UserType);
          setClientId('');
        }}
      >
        <TabsList className="grid grid-cols-3 w-full">
          {SELECTABLE_USER_TYPES.map((t) => (
            <TabsTrigger key={t} value={t} disabled={disabled}>
              {getUserTypeLabel(t)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {userType === USER_TYPES.STUDENT && (
        <SearchableSelect
          options={[ALL_CLIENTS_OPTION, ...clients.map((c) => ({ value: c.client_id, label: c.client_name }))]}
          value={clientId}
          onChange={setClientId}
          placeholder="顧客で絞り込み（任意）"
          searchPlaceholder="顧客名で検索..."
          disabled={disabled}
        />
      )}

      <Command className="rounded-xl border border-slate-200">
        <CommandInput placeholder="名前で検索..." className="h-9" disabled={disabled} />
        <CommandList className="max-h-[220px]">
          <CommandEmpty>該当するユーザーが見つかりません。</CommandEmpty>
          <CommandGroup>
            {filteredUsers.map((u) => {
              const checked = selectedIds.includes(u.id);
              return (
                <CommandItem
                  key={u.id}
                  value={`${u.user_name || ''} ${u.id}`}
                  onSelect={() => !disabled && toggle(u.id)}
                  className="cursor-pointer"
                >
                  <Check className={cn('mr-2 h-4 w-4 shrink-0', checked ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">
                    {u.user_name || '（名称未設定）'}
                    {u.client_id ? ` - ${clientNameById.get(u.client_id) || '（顧客不明）'}` : ''}
                  </span>
                  <span className="ml-auto pl-2 text-[10px] text-slate-400 shrink-0">{getUserTypeLabel(u.user_type)}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </Command>

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {selectedIds.map((id) => {
            const u = usersById.get(id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium pl-2.5 pr-1.5 py-1"
              >
                {u?.user_name || '（名称未設定）'}
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  disabled={disabled}
                  className="hover:text-indigo-900"
                  aria-label={`${u?.user_name || '（名称未設定）'}を削除`}
                >
                  <X size={12} />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
