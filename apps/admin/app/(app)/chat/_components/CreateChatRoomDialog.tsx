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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@gabby/lib/hooks/useToast';
import { getUserTypeLabel } from '@gabby/types/user';
import { ChatTargetUser } from '@gabby/types/chat';
import { getChatRoomTargetUsers, createChatRoom } from '@gabby/lib/chat/actions/roomActions';

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
  const [memberIdA, setMemberIdA] = useState<string>('');
  const [memberIdB, setMemberIdB] = useState<string>('');

  const handleOpenChange = async (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setMemberIdA('');
      setMemberIdB('');
      return;
    }

    setIsLoadingUsers(true);
    try {
      const res = await getChatRoomTargetUsers();
      if (res.success) {
        setCandidateUsers(res.data);
      } else {
        showToast(res.error || 'ユーザー一覧の取得に失敗しました', 'error');
      }
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const isSameUser = memberIdA !== '' && memberIdA === memberIdB;

  const handleCreate = async () => {
    if (!memberIdA || !memberIdB || isSameUser) return;

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
          Admin・コーチ・生徒の中から異なる種別の2名を選択してください（例: Admin×コーチ、Admin×生徒、コーチ×生徒）。
        </p>

        <div className="py-2 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-600 mb-1.5 block">参加者 1</label>
            <Select value={memberIdA} onValueChange={setMemberIdA} disabled={isLoadingUsers}>
              <SelectTrigger>
                <SelectValue placeholder={isLoadingUsers ? '読み込み中...' : '参加者を選択してください'} />
              </SelectTrigger>
              <SelectContent>
                {candidateUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.user_name || '（名称未設定）'}（{getUserTypeLabel(u.user_type)}）
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-600 mb-1.5 block">参加者 2</label>
            <Select value={memberIdB} onValueChange={setMemberIdB} disabled={isLoadingUsers}>
              <SelectTrigger>
                <SelectValue placeholder={isLoadingUsers ? '読み込み中...' : '参加者を選択してください'} />
              </SelectTrigger>
              <SelectContent>
                {candidateUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.user_name || '（名称未設定）'}（{getUserTypeLabel(u.user_type)}）
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isSameUser && <p className="text-xs text-rose-500">異なる2名を選択してください</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            キャンセル
          </Button>
          <Button onClick={handleCreate} disabled={!memberIdA || !memberIdB || isSameUser || isCreating} className="gap-1.5">
            {isCreating && <Loader2 size={16} className="animate-spin" />}
            作成する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
