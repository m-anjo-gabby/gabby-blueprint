'use client';

import { useMemo, useState } from 'react';
import { Plus, MessagesSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DIALOGUE_CATEGORIES } from '@gabby/types/dialogue';
import type { DialogueAssignmentSummary, DialogueCategory, DialogueContentSummary } from '@gabby/types/dialogue';
import { useDialoguePracticeAssignments } from '../../_hooks/useDialoguePracticeAssignments';
import { AssignDialogueDialog } from '../../_components/AssignDialogueDialog';
import { DialogueAssignmentCard } from './DialogueAssignmentCard';

interface Props {
  studentId: string;
  availableContents: DialogueContentSummary[];
  initialAssignments: DialogueAssignmentSummary[];
}

type CategoryFilter = 'all' | DialogueCategory;
const FILTER_ORDER: CategoryFilter[] = ['all', 1, 2, 3, 4];

function filterLabel(filter: CategoryFilter): string {
  return filter === 'all' ? 'All' : DIALOGUE_CATEGORIES[filter].label;
}

export function DialoguePracticeManager({ studentId, availableContents, initialAssignments }: Props) {
  const [isAssignDialogOpen, setAssignDialogOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<CategoryFilter>('all');
  const { assignments, assignedContentIds, isRefreshing, handleAssigned, handleUnassign, handleProgressChange } =
    useDialoguePracticeAssignments(studentId, initialAssignments);

  const onAssigned = async () => {
    setAssignDialogOpen(false);
    await handleAssigned();
  };

  const filteredAssignments = useMemo(
    () => (activeFilter === 'all' ? assignments : assignments.filter((a) => a.category_id === activeFilter)),
    [assignments, activeFilter]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-3 flex-wrap">
        {assignments.length > 0 && (
          <Tabs
            value={String(activeFilter)}
            onValueChange={(v) => setActiveFilter(v === 'all' ? 'all' : (Number(v) as DialogueCategory))}
            className="mr-auto"
          >
            <TabsList>
              {FILTER_ORDER.map((f) => (
                <TabsTrigger key={f} value={String(f)}>
                  {filterLabel(f)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
        <Button type="button" size="sm" onClick={() => setAssignDialogOpen(true)} disabled={isRefreshing}>
          <Plus size={14} />
          Assign Set
        </Button>
      </div>

      {assignments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-slate-200 rounded-2xl">
          <MessagesSquare size={24} className="text-slate-300 mb-2" />
          <p className="text-sm font-semibold text-slate-400">No dialogue sets assigned yet</p>
          <p className="text-xs text-slate-400 mt-1">Assign a set to start tracking this student&apos;s progress.</p>
        </div>
      ) : filteredAssignments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-slate-200 rounded-2xl">
          <MessagesSquare size={24} className="text-slate-300 mb-2" />
          <p className="text-sm font-semibold text-slate-400">No {filterLabel(activeFilter)} sets assigned</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredAssignments.map((assignment) => (
            <DialogueAssignmentCard
              key={assignment.assignment_id}
              assignment={assignment}
              onUnassign={() => handleUnassign(assignment.assignment_id)}
              onProgressChange={handleProgressChange}
            />
          ))}
        </div>
      )}

      <AssignDialogueDialog
        open={isAssignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        studentId={studentId}
        availableContents={availableContents}
        assignedContentIds={assignedContentIds}
        onAssigned={onAssigned}
      />
    </div>
  );
}
