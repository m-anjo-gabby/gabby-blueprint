'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@gabby/lib/hooks/useToast';
import { ChatTargetUser } from '@gabby/types/chat';
import { ClientOption } from '@gabby/types/client';
import { getChatRoomTargetUsers, createChatRoom } from '@gabby/lib/chat/actions/roomActions';
import { getClientsFilter } from '@/actions/adminClientAction';
import { ParticipantPicker, ParticipantSelection, EMPTY_PARTICIPANT_SELECTION } from './ParticipantPicker';

interface CreateChatRoomDialogProps {
  onCreated: () => void;
}

export function CreateChatRoomDialog({ onCreated }: CreateChatRoomDialogProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [candidateUsers, setCandidateUsers] = useState<ChatTargetUser[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [participantA, setParticipantA] = useState<ParticipantSelection>(EMPTY_PARTICIPANT_SELECTION);
  const [participantB, setParticipantB] = useState<ParticipantSelection>(EMPTY_PARTICIPANT_SELECTION);

  const handleOpenChange = async (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setParticipantA(EMPTY_PARTICIPANT_SELECTION);
      setParticipantB(EMPTY_PARTICIPANT_SELECTION);
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

  const handleCreate = async () => {
    if (!memberIdA || !memberIdB || isSameUser || isSameUserType) return;

    setIsCreating(true);
    try {
      const res = await createChatRoom({ memberIds: [memberIdA, memberIdB] });
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

        <p className="text-xs text-slate-500 -mt-2">
          Admin・コーチ・生徒の中から異なる種別の2名を選択してください（例: Admin×コーチ、Admin×生徒、コーチ×生徒）。生徒を選択する場合は顧客で絞り込めます。
        </p>

        <div className="py-2 space-y-5">
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

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            キャンセル
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!memberIdA || !memberIdB || isSameUser || isSameUserType || isCreating}
            className="gap-1.5"
          >
            {isCreating && <Loader2 size={16} className="animate-spin" />}
            作成する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
