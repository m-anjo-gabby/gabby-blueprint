'use client';

import { useMemo, useState } from 'react';
import { Loader2, Trash2, UserPlus, Users as UsersIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@gabby/lib/hooks/useToast';
import { useConfirm } from '@gabby/lib/hooks/useConfirm';
import { getUserTypeLabel, USER_TYPES, UserType } from '@gabby/types/user';
import { ChatRoomMemberSummary, ChatTargetUser } from '@gabby/types/chat';
import { ClientOption } from '@gabby/types/client';
import { getChatRoomTargetUsers, addChatRoomMember, removeChatRoomMember } from '@gabby/lib/chat/actions/roomActions';
import { getClientsFilter } from '@/actions/adminClientAction';
import { getProfileIconUrl } from '@gabby/lib/profile/getProfileIconUrl';
import { SearchableSelect } from '@/components/common/SearchableSelect';

const SELECTABLE_USER_TYPES: UserType[] = [USER_TYPES.ADMIN, USER_TYPES.STUDENT, USER_TYPES.COACH];
const ALL_CLIENTS_OPTION = { value: '', label: 'すべての顧客（絞り込みなし）' };
const MIN_GROUP_ROOM_MEMBERS = 2;

interface ManageGroupParticipantsDialogProps {
  roomId: string;
  members: ChatRoomMemberSummary[];
  onChanged: () => void;
}

export function ManageGroupParticipantsDialog({ roomId, members, onChanged }: ManageGroupParticipantsDialogProps) {
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();
  const [open, setOpen] = useState(false);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [candidateUsers, setCandidateUsers] = useState<ChatTargetUser[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [currentMembers, setCurrentMembers] = useState<ChatRoomMemberSummary[]>(members);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const [addUserType, setAddUserType] = useState<UserType | ''>('');
  const [addClientId, setAddClientId] = useState('');
  const [addUserId, setAddUserId] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleOpenChange = async (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setAddUserType('');
      setAddClientId('');
      setAddUserId('');
      return;
    }

    setCurrentMembers(members);
    setIsLoadingCandidates(true);
    try {
      const [usersRes, clientsRes] = await Promise.all([getChatRoomTargetUsers(), getClientsFilter()]);
      if (usersRes.success) {
        setCandidateUsers(usersRes.data);
      } else {
        showToast(usersRes.error || 'ユーザー一覧の取得に失敗しました', 'error');
      }
      setClients(clientsRes);
    } finally {
      setIsLoadingCandidates(false);
    }
  };

  const currentMemberIds = useMemo(() => new Set(currentMembers.map((m) => m.user_id)), [currentMembers]);
  const clientNameById = useMemo(() => new Map(clients.map((c) => [c.client_id, c.client_name])), [clients]);

  const addableUsers = useMemo(
    () =>
      candidateUsers.filter((u) => {
        if (currentMemberIds.has(u.id)) return false;
        if (addUserType && u.user_type !== addUserType) return false;
        if (addUserType === USER_TYPES.STUDENT && addClientId && u.client_id !== addClientId) return false;
        return true;
      }),
    [candidateUsers, currentMemberIds, addUserType, addClientId]
  );

  const addUserOptions = addableUsers.map((u) => ({
    value: u.id,
    label: `${u.user_name || '（名称未設定）'}${u.client_id ? ` - ${clientNameById.get(u.client_id) || '（顧客不明）'}` : ''}`,
  }));

  const handleAdd = async () => {
    if (!addUserId) return;
    setIsAdding(true);
    try {
      const res = await addChatRoomMember({ roomId, userId: addUserId });
      if (!res.success || !res.member) {
        showToast(res.error || '参加者の追加に失敗しました', 'error');
        return;
      }
      setCurrentMembers((prev) => [...prev, res.member!]);
      setAddUserId('');
      onChanged();
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (member: ChatRoomMemberSummary) => {
    if (currentMembers.length <= MIN_GROUP_ROOM_MEMBERS) {
      showToast(`グループの参加者は最低${MIN_GROUP_ROOM_MEMBERS}名必要です`, 'error');
      return;
    }

    const ok = await showConfirm(
      '参加者を削除',
      `${member.user_name || '（名称未設定）'}さんをこのグループから削除しますか？`,
      { variant: 'danger', isModal: true }
    );
    if (!ok) return;

    setPendingIds((prev) => new Set(prev).add(member.user_id));
    try {
      const res = await removeChatRoomMember({ roomId, userId: member.user_id });
      if (!res.success) {
        showToast(res.error || '参加者の削除に失敗しました', 'error');
        return;
      }
      setCurrentMembers((prev) => prev.filter((m) => m.user_id !== member.user_id));
      onChanged();
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(member.user_id);
        return next;
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <button
        onClick={() => handleOpenChange(true)}
        className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors shrink-0"
      >
        <UsersIcon size={13} />
        参加者を管理
      </button>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>参加者を管理</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-600 block">
              現在の参加者（{currentMembers.length}名）
            </label>
            <div className="max-h-[240px] overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
              {currentMembers.map((member) => {
                const iconUrl = getProfileIconUrl(member.icon_path);
                const isPending = pendingIds.has(member.user_id);
                return (
                  <div key={member.user_id} className="flex items-center gap-3 px-3 py-2.5">
                    {iconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={iconUrl} alt="" className="w-8 h-8 shrink-0 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 shrink-0 rounded-full bg-indigo-50 flex items-center justify-center">
                        <UsersIcon size={14} className="text-indigo-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {member.user_name || '（名称未設定）'}
                      </p>
                      <p className="text-[11px] text-slate-400">{getUserTypeLabel(member.user_type)}</p>
                    </div>
                    <button
                      onClick={() => handleRemove(member)}
                      disabled={isPending || currentMembers.length <= MIN_GROUP_ROOM_MEMBERS}
                      title={
                        currentMembers.length <= MIN_GROUP_ROOM_MEMBERS
                          ? `グループの参加者は最低${MIN_GROUP_ROOM_MEMBERS}名必要です`
                          : '削除する'
                      }
                      className="p-1.5 rounded-md text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-300"
                    >
                      {isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 pt-1 border-t border-slate-100">
            <label className="text-xs font-bold text-slate-600 block pt-3">参加者を追加</label>

            <Tabs
              value={addUserType}
              onValueChange={(next) => {
                setAddUserType(next as UserType);
                setAddClientId('');
                setAddUserId('');
              }}
            >
              <TabsList className="grid grid-cols-3 w-full">
                {SELECTABLE_USER_TYPES.map((t) => (
                  <TabsTrigger key={t} value={t} disabled={isLoadingCandidates}>
                    {getUserTypeLabel(t)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {addUserType === USER_TYPES.STUDENT && (
              <SearchableSelect
                options={[ALL_CLIENTS_OPTION, ...clients.map((c) => ({ value: c.client_id, label: c.client_name }))]}
                value={addClientId}
                onChange={(clientId) => {
                  setAddClientId(clientId);
                  setAddUserId('');
                }}
                placeholder="顧客で絞り込み（任意）"
                searchPlaceholder="顧客名で検索..."
                disabled={isLoadingCandidates}
              />
            )}

            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <SearchableSelect
                  options={addUserOptions}
                  value={addUserId}
                  onChange={setAddUserId}
                  placeholder={addUserType ? '参加者を選択してください' : '先にユーザー種別を選択してください'}
                  searchPlaceholder="名前で検索..."
                  emptyMessage="追加できるユーザーが見つかりません。"
                  disabled={isLoadingCandidates || !addUserType}
                />
              </div>
              <Button onClick={handleAdd} disabled={!addUserId || isAdding} className="gap-1.5 shrink-0">
                {isAdding ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                追加
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
