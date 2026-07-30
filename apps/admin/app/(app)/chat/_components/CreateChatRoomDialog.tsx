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
import { CHAT_ROOM_TYPES, ChatTargetUser } from '@gabby/types/chat';
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
  const [targetUsers, setTargetUsers] = useState<ChatTargetUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  const handleOpenChange = async (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setSelectedUserId('');
      return;
    }

    setIsLoadingUsers(true);
    try {
      const res = await getChatRoomTargetUsers();
      if (res.success) {
        setTargetUsers(res.data);
      } else {
        showToast(res.error || '宛先ユーザーの取得に失敗しました', 'error');
      }
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const handleCreate = async () => {
    if (!selectedUserId) return;

    setIsCreating(true);
    try {
      const res = await createChatRoom({ targetUserId: selectedUserId, roomType: CHAT_ROOM_TYPES.ADMIN });
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

        <div className="py-2">
          <label className="text-xs font-bold text-slate-600 mb-1.5 block">宛先ユーザー</label>
          <Select value={selectedUserId} onValueChange={setSelectedUserId} disabled={isLoadingUsers}>
            <SelectTrigger>
              <SelectValue placeholder={isLoadingUsers ? '読み込み中...' : '宛先を選択してください'} />
            </SelectTrigger>
            <SelectContent>
              {targetUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.user_name || '（名称未設定）'}（{getUserTypeLabel(u.user_type)}）
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            キャンセル
          </Button>
          <Button onClick={handleCreate} disabled={!selectedUserId || isCreating} className="gap-1.5">
            {isCreating && <Loader2 size={16} className="animate-spin" />}
            作成する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
