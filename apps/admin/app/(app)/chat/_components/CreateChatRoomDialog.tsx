'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@gabby/lib/hooks/useToast';
import { CHAT_ROOM_TYPES, ChatRoomType, ChatTargetUser } from '@gabby/types/chat';
import { ClientOption } from '@gabby/types/client';
import { getChatRoomTargetUsers, createChatRoom } from '@gabby/lib/chat/actions/roomActions';
import { getClientsFilter } from '@/actions/adminClientAction';
import { ParticipantPicker, ParticipantSelection, EMPTY_PARTICIPANT_SELECTION } from './ParticipantPicker';
import { GroupParticipantsPicker } from './GroupParticipantsPicker';

interface CreateChatRoomDialogProps {
  onCreated: () => void;
}

const ROOM_TYPE_LABELS: Record<ChatRoomType, string> = {
  [CHAT_ROOM_TYPES.ONE_ON_ONE]: '1対1',
  [CHAT_ROOM_TYPES.GROUP]: 'グループ',
};

export function CreateChatRoomDialog({ onCreated }: CreateChatRoomDialogProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [candidateUsers, setCandidateUsers] = useState<ChatTargetUser[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [roomType, setRoomType] = useState<ChatRoomType>(CHAT_ROOM_TYPES.ONE_ON_ONE);
  const [participantA, setParticipantA] = useState<ParticipantSelection>(EMPTY_PARTICIPANT_SELECTION);
  const [participantB, setParticipantB] = useState<ParticipantSelection>(EMPTY_PARTICIPANT_SELECTION);
  const [roomName, setRoomName] = useState('');
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);

  const resetForm = () => {
    setRoomType(CHAT_ROOM_TYPES.ONE_ON_ONE);
    setParticipantA(EMPTY_PARTICIPANT_SELECTION);
    setParticipantB(EMPTY_PARTICIPANT_SELECTION);
    setRoomName('');
    setGroupMemberIds([]);
  };

  const handleOpenChange = async (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetForm();
      return;
    }

    setIsLoadingUsers(true);
    try {
      const [usersRes, clientsRes] = await Promise.all([getChatRoomTargetUsers(), getClientsFilter()]);
      if (usersRes.success) {
        setCandidateUsers(usersRes.data);
      } else {
        showToast(usersRes.error || 'ユーザー一覧の取得に失敗しました', 'error');
      }
      setClients(clientsRes);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const memberIdA = participantA.userId;
  const memberIdB = participantB.userId;
  const isSameUser = memberIdA !== '' && memberIdA === memberIdB;
  const isSameUserType =
    participantA.userType !== '' && participantA.userType === participantB.userType;

  const isOneOnOne = roomType === CHAT_ROOM_TYPES.ONE_ON_ONE;
  const isOneOnOneValid = Boolean(memberIdA && memberIdB) && !isSameUser && !isSameUserType;
  const isGroupValid = roomName.trim() !== '' && groupMemberIds.length >= 2;
  const canCreate = (isOneOnOne ? isOneOnOneValid : isGroupValid) && !isCreating;

  const handleCreate = async () => {
    if (!canCreate) return;

    setIsCreating(true);
    try {
      const res = isOneOnOne
        ? await createChatRoom({ roomType, memberIds: [memberIdA, memberIdB] })
        : await createChatRoom({ roomType, memberIds: groupMemberIds, roomName: roomName.trim() });

      if (!res.success || !res.roomId) {
        showToast(res.error || 'チャットルームの作成に失敗しました', 'error');
        return;
      }

      setOpen(false);
      onCreated();
      router.push(`/chat/${res.roomId}`);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button size="sm" className="gap-1.5" onClick={() => handleOpenChange(true)}>
        <Plus size={16} />
        新規チャット作成
      </Button>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>新規チャット作成</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <Tabs value={roomType} onValueChange={(t) => setRoomType(t as ChatRoomType)}>
            <TabsList className="grid grid-cols-2 w-full">
              {(Object.keys(ROOM_TYPE_LABELS) as ChatRoomType[]).map((t) => (
                <TabsTrigger key={t} value={t} disabled={isLoadingUsers}>
                  {ROOM_TYPE_LABELS[t]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {isOneOnOne ? (
            <div className="space-y-5">
              <p className="text-xs text-slate-500">
                Admin・コーチ・生徒の中から異なる種別の2名を選択してください（例: Admin×コーチ、Admin×生徒、コーチ×生徒）。生徒を選択する場合は顧客で絞り込めます。
              </p>

              <ParticipantPicker
                label="参加者 1"
                users={candidateUsers}
                clients={clients}
                value={participantA}
                onChange={setParticipantA}
                disabled={isLoadingUsers}
              />

              <ParticipantPicker
                label="参加者 2"
                users={candidateUsers}
                clients={clients}
                value={participantB}
                onChange={setParticipantB}
                disabled={isLoadingUsers}
              />

              {isSameUser && <p className="text-xs text-rose-500">異なる2名を選択してください</p>}
              {!isSameUser && isSameUserType && (
                <p className="text-xs text-rose-500">同一のユーザー種別同士は選択できません（異なる種別を選択してください）</p>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              <p className="text-xs text-slate-500">
                ルーム名と参加者（2名以上）を指定してグループチャットを作成します。参加者はAdmin・コーチ・生徒から種別を問わず選択できます。
              </p>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-600 block">ルーム名</label>
                <Input
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="例: 中学受験対策チーム"
                  disabled={isLoadingUsers}
                  maxLength={100}
                />
              </div>

              <GroupParticipantsPicker
                users={candidateUsers}
                clients={clients}
                selectedIds={groupMemberIds}
                onChange={setGroupMemberIds}
                disabled={isLoadingUsers}
              />

              {groupMemberIds.length > 0 && groupMemberIds.length < 2 && (
                <p className="text-xs text-rose-500">参加者を2名以上選択してください</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            キャンセル
          </Button>
          <Button onClick={handleCreate} disabled={!canCreate} className="gap-1.5">
            {isCreating && <Loader2 size={16} className="animate-spin" />}
            作成する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
