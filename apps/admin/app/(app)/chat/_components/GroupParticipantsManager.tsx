'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { ChatAvatar } from '@gabby/lib/components/chat/ChatAvatar';
import { getUserTypeLabel, USER_TYPES, UserType } from '@gabby/types/user';
import { ChatRoomMemberSummary, ChatTargetUser } from '@gabby/types/chat';
import { ClientOption } from '@gabby/types/client';
import { getChatRoomTargetUsers, addChatRoomMember, removeChatRoomMember } from '@gabby/lib/chat/actions/roomActions';
import { getClientsFilter } from '@/actions/adminClientAction';
import { SearchableSelect } from '@/components/common/SearchableSelect';

const SELECTABLE_USER_TYPES: UserType[] = [USER_TYPES.ADMIN, USER_TYPES.STUDENT, USER_TYPES.COACH];
const MIN_GROUP_ROOM_MEMBERS = 2;

interface GroupParticipantsManagerProps {
  roomId: string;
  members: ChatRoomMemberSummary[];
  /** 追加・削除の後に呼ぶ（サーバーの最新の参加者で画面を更新する） */
  onChanged: () => void;
}

/**
 * グループルームの参加者の一覧・削除・追加（Adminのみ）。ルーム情報パネルに置く。
 * 追加候補のユーザー・顧客は、追加欄を開いたときに初めて取得する。
 */
export function GroupParticipantsManager({ roomId, members, onChanged }: GroupParticipantsManagerProps) {
  const t = useTranslations('chat.manageParticipantsDialog');
  const tCommon = useTranslations('chat.common');
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [candidateUsers, setCandidateUsers] = useState<ChatTargetUser[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [addUserType, setAddUserType] = useState<UserType | ''>('');
  const [addClientId, setAddClientId] = useState('');
  const [addUserId, setAddUserId] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const openAddSection = async () => {
    setIsAddOpen(true);
    if (candidateUsers.length > 0) return;
    setIsLoadingCandidates(true);
    try {
      const [usersRes, clientsRes] = await Promise.all([getChatRoomTargetUsers(), getClientsFilter()]);
      if (usersRes.success) {
        setCandidateUsers(usersRes.data);
      } else {
        showToast(usersRes.error || t('toastUsersFetchFailed'), 'error');
      }
      setClients(clientsRes);
    } finally {
      setIsLoadingCandidates(false);
    }
  };

  const currentMemberIds = useMemo(() => new Set(members.map((m) => m.user_id)), [members]);
  const clientNameById = useMemo(() => new Map(clients.map((c) => [c.client_id, c.client_name])), [clients]);

  const addUserOptions = useMemo(
    () =>
      candidateUsers
        .filter((u) => {
          if (currentMemberIds.has(u.id)) return false;
          if (addUserType && u.user_type !== addUserType) return false;
          if (addUserType === USER_TYPES.STUDENT && addClientId && u.client_id !== addClientId) return false;
          return true;
        })
        .map((u) => ({
          value: u.id,
          label: `${u.user_name || tCommon('unnamed')}${u.client_id ? ` - ${clientNameById.get(u.client_id) || tCommon('unknownClient')}` : ''}`,
        })),
    [candidateUsers, currentMemberIds, addUserType, addClientId, clientNameById, tCommon]
  );

  const handleAdd = async () => {
    if (!addUserId) return;
    setIsAdding(true);
    try {
      const res = await addChatRoomMember({ roomId, userId: addUserId });
      if (!res.success || !res.member) {
        showToast(res.error || t('toastAddFailed'), 'error');
        return;
      }
      setAddUserId('');
      onChanged();
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (member: ChatRoomMemberSummary) => {
    if (members.length <= MIN_GROUP_ROOM_MEMBERS) {
      showToast(t('minMembersError', { min: MIN_GROUP_ROOM_MEMBERS }), 'error');
      return;
    }

    const ok = await showConfirm(
      t('removeConfirmTitle'),
      t('removeConfirmBody', { name: member.user_name || tCommon('unnamed') }),
      { variant: 'danger', isModal: true }
    );
    if (!ok) return;

    setPendingIds((prev) => new Set(prev).add(member.user_id));
    try {
      const res = await removeChatRoomMember({ roomId, userId: member.user_id });
      if (!res.success) {
        showToast(res.error || t('toastRemoveFailed'), 'error');
        return;
      }
      onChanged();
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(member.user_id);
        return next;
      });
    }
  };

  const isAtMinimum = members.length <= MIN_GROUP_ROOM_MEMBERS;

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-line rounded-xl border border-line">
        {members.map((member) => {
          const isPending = pendingIds.has(member.user_id);
          return (
            <li key={member.user_id} className="flex items-center gap-3 px-3 py-2.5">
              <ChatAvatar iconPath={member.icon_path} name={member.user_name} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{member.user_name || tCommon('unnamed')}</p>
                <p className="truncate text-[11px] text-ink-subtle">
                  {getUserTypeLabel(member.user_type)}
                  {member.client_name ? ` · ${member.client_name}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(member)}
                disabled={isPending || isAtMinimum}
                title={isAtMinimum ? t('minMembersError', { min: MIN_GROUP_ROOM_MEMBERS }) : t('deleteTooltip')}
                aria-label={tCommon('removeAriaLabel', { name: member.user_name || tCommon('unnamed') })}
                className="rounded-md p-1.5 text-ink-subtle transition-colors hover:bg-rose-50 hover:text-rose-500 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-subtle"
              >
                {isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </li>
          );
        })}
      </ul>

      {!isAddOpen ? (
        <Button variant="outline" size="sm" className="w-full" icon={<UserPlus size={15} />} onClick={openAddSection}>
          {t('addSectionLabel')}
        </Button>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-bold text-ink-soft">{t('addSectionLabel')}</p>
          <Tabs
            value={addUserType}
            onValueChange={(next) => {
              setAddUserType(next as UserType);
              setAddClientId('');
              setAddUserId('');
            }}
          >
            <TabsList className="grid w-full grid-cols-3">
              {SELECTABLE_USER_TYPES.map((type) => (
                <TabsTrigger key={type} value={type} disabled={isLoadingCandidates}>
                  {getUserTypeLabel(type)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {addUserType === USER_TYPES.STUDENT && (
            <SearchableSelect
              options={[
                { value: '', label: tCommon('allClientsOption') },
                ...clients.map((c) => ({ value: c.client_id, label: c.client_name })),
              ]}
              value={addClientId}
              onChange={(clientId) => {
                setAddClientId(clientId);
                setAddUserId('');
              }}
              placeholder={tCommon('clientFilterPlaceholder')}
              searchPlaceholder={tCommon('clientSearchPlaceholder')}
              disabled={isLoadingCandidates}
            />
          )}

          <SearchableSelect
            options={addUserOptions}
            value={addUserId}
            onChange={setAddUserId}
            placeholder={addUserType ? t('addPlaceholder') : t('addPlaceholderNoType')}
            searchPlaceholder={tCommon('nameSearchPlaceholder')}
            emptyMessage={t('addEmptyMessage')}
            disabled={isLoadingCandidates || !addUserType}
          />
          <Button
            size="sm"
            className="w-full"
            pending={isAdding}
            icon={<UserPlus size={15} />}
            onClick={handleAdd}
            disabled={!addUserId}
          >
            {t('addButton')}
          </Button>
        </div>
      )}
    </div>
  );
}
