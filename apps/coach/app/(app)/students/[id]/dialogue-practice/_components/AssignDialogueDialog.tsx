'use client';

import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useToast } from '@gabby/lib/hooks/useToast';
import { assignDialogueContent } from '@/actions/dialogueAction';
import { DIALOGUE_CATEGORIES } from '@gabby/types/dialogue';
import type { DialogueCategory, DialogueContentSummary } from '@gabby/types/dialogue';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  availableContents: DialogueContentSummary[];
  assignedContentIds: Set<string>;
  onAssigned: () => void;
}

const CATEGORY_ORDER: DialogueCategory[] = [1, 2, 3, 4];

export function AssignDialogueDialog({
  open,
  onOpenChange,
  studentId,
  availableContents,
  assignedContentIds,
  onAssigned,
}: Props) {
  const [activeCategory, setActiveCategory] = useState<DialogueCategory>(1);
  const [assigningContentId, setAssigningContentId] = useState<string | null>(null);
  const { showToast } = useToast();

  const contentsByCategory = useMemo(() => {
    const map = new Map<DialogueCategory, DialogueContentSummary[]>();
    CATEGORY_ORDER.forEach((c) => map.set(c, []));
    availableContents.forEach((c) => {
      map.get(c.category_id)?.push(c);
    });
    return map;
  }, [availableContents]);

  const handleAssign = async (contentId: string) => {
    setAssigningContentId(contentId);
    try {
      const result = await assignDialogueContent(studentId, contentId);
      if (!result.success) {
        showToast(result.message, 'error');
        return;
      }
      onAssigned();
    } finally {
      setAssigningContentId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Assign a Dialogue Practice set</DialogTitle>
          <DialogDescription>Sets already assigned to this student are hidden from the list below.</DialogDescription>
        </DialogHeader>

        <Tabs value={String(activeCategory)} onValueChange={(v) => setActiveCategory(Number(v) as DialogueCategory)}>
          <TabsList>
            {CATEGORY_ORDER.map((c) => (
              <TabsTrigger key={c} value={String(c)}>
                {DIALOGUE_CATEGORIES[c].label}
              </TabsTrigger>
            ))}
          </TabsList>

          {CATEGORY_ORDER.map((c) => {
            const contents = (contentsByCategory.get(c) ?? []).filter(
              (content) => !assignedContentIds.has(content.content_id)
            );
            return (
              <TabsContent key={c} value={String(c)} className="max-h-96 overflow-y-auto space-y-1.5 mt-3">
                {contents.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-8">No unassigned sets in this category.</p>
                ) : (
                  contents.map((content) => (
                    <div
                      key={content.content_id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">{content.content_name}</p>
                        <p className="text-[11px] text-slate-400">
                          {content.session_count} session{content.session_count === 1 ? '' : 's'}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={assigningContentId === content.content_id}
                        onClick={() => handleAssign(content.content_id)}
                      >
                        {assigningContentId === content.content_id && <Loader2 size={14} className="animate-spin" />}
                        Assign
                      </Button>
                    </div>
                  ))
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
