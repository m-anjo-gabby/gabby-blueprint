'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tag as TagIcon, Plus, X, Loader2, ArrowLeft, CheckCircle2, Hash } from 'lucide-react'
import { getTagAssignmentData, assignTag, removeTag } from '@/actions/adminContentAction'
import { useToast } from '@gabby/lib/hooks/useToast'
import { Content, ContentTagSummary } from '@/types/content'

interface Props {
  content: Content
}

export function ContentTagDialog({ content }: Props) {
  const [open, setOpen] = useState(false)
  const [isAddMode, setIsAddMode] = useState(false)
  const [loading, setLoading] = useState(false)
  
  // 割当済みタグと、まだ割り当てていない全マスタタグ
  const [assignedTags, setAssignedTags] = useState<ContentTagSummary[]>(content.tags || [])
  const [unassignedTags, setUnassignedTags] = useState<ContentTagSummary[]>([])
  
  const { showToast } = useToast()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getTagAssignmentData(content.content_id)
      setAssignedTags(data.assignedTags)
      setUnassignedTags(data.unassignedTags)
    } catch (error) {
      showToast('タグデータの取得に失敗しました', 'error')
    } finally {
      setLoading(false)
    }
  }, [content.content_id, showToast])

  useEffect(() => {
    if (open) {
      loadData()
      setIsAddMode(false)
    }
  }, [open, loadData])

  // タグ割当実行
  const handleAdd = async (tagId: string) => {
    setLoading(true)
    try {
      const res = await assignTag(content.content_id, tagId)
      if (res.success) {
        await loadData() // 一覧を再読込
        showToast('タグを追加しました', 'success')
      }
    } catch {
      showToast('タグの追加に失敗しました', 'error')
    } finally {
      setLoading(false)
    }
  }

  // タグ解除実行
  const handleRemove = async (tagId: string) => {
    setLoading(true)
    try {
      const res = await removeTag(content.content_id, tagId)
      if (res.success) {
        await loadData()
        showToast('タグを解除しました', 'success')
      }
    } catch {
      showToast('タグの解除に失敗しました', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {assignedTags.length > 0 ? (
          <div className="flex items-center gap-2 group cursor-pointer">
            {/* 既にタグがある場合はバッジを表示し、最後に + アイコンを表示 */}
            <div className="flex flex-wrap gap-1">
              {assignedTags.map((tag) => (
                <Badge 
                  key={tag.tag_id} 
                  variant="secondary" 
                  className="bg-slate-100 text-slate-600 border-slate-200 text-[10px] font-bold px-1.5 h-5 shadow-sm"
                >
                  {tag.tag_name}
                </Badge>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 text-indigo-500 bg-indigo-50/50 border border-indigo-100 hover:text-white hover:bg-indigo-600 hover:border-indigo-600 rounded-full transition-all duration-200 shadow-sm ml-1"
              title="タグを編集"
            >
              <Plus size={12} strokeWidth={3} />
            </Button>
          </div>
        ) : (
          /* 未設定時の表示：点線のボタン */
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-[10px] border-dashed border-slate-300 text-slate-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 rounded-lg transition-all group/btn"
          >
            <TagIcon size={10} className="mr-1.5" />
            <span className="font-bold mr-1.5">未設定</span>
            {/* プラスアイコン */}
            <Plus 
              size={12} 
              strokeWidth={3} 
              className="text-indigo-400 group-hover/btn:text-indigo-600 transition-colors" 
            />
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl">
        <DialogHeader className="p-6 bg-slate-900 text-white">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Hash className="text-indigo-400" size={20} />
            {isAddMode ? 'タグを追加' : '設定中のタグ'}
          </DialogTitle>
        </DialogHeader>

        <div className="p-6 bg-white min-h-[400px]">
          {loading && assignedTags.length === 0 ? (
            <div className="flex justify-center p-12"><Loader2 className="animate-spin text-indigo-500" /></div>
          ) : isAddMode ? (
            /* --- 追加モード：マスタから選択 --- */
            <div className="space-y-4">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setIsAddMode(false)} 
                className="h-8 text-slate-500 hover:text-indigo-600 p-0 font-bold"
              >
                <ArrowLeft size={16} className="mr-1" /> 戻る
              </Button>
              
              <ScrollArea className="h-[350px] pr-4">
                {unassignedTags.length === 0 ? (
                  /* 全タグ割当済み、またはマスタが空の場合のエンプティステート */
                  <div className="text-center py-20 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                    <CheckCircle2 className="mx-auto text-emerald-400 mb-2" size={32} />
                    <p className="text-sm text-slate-500 font-bold px-4">
                      追加できるタグがありません
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1 px-6 leading-relaxed">
                      すべてのタグが設定済みか、<br />
                      タグ自体が登録されていません。
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {unassignedTags.map(tag => (
                      <div 
                        key={tag.tag_id} 
                        className="flex items-center justify-between p-3 border rounded-xl hover:border-indigo-200 transition-colors bg-slate-50/50 group"
                      >
                        <div>
                          <p className="text-sm font-bold text-slate-800">{tag.tag_name}</p>
                          <Badge variant="outline" className="text-[9px] uppercase tracking-wider text-slate-400 p-0 border-none h-auto italic">
                            {tag.tag_type}
                          </Badge>
                        </div>
                        <Button 
                          size="sm" 
                          onClick={() => handleAdd(tag.tag_id)} 
                          disabled={loading} 
                          className="bg-indigo-600 hover:bg-indigo-700 h-8 rounded-lg shadow-sm font-bold"
                        >
                          追加
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          ) : (
            /* --- 一覧モード：現在の割当を表示 --- */
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Current Tags</p>
                <Button size="sm" onClick={() => setIsAddMode(true)} className="bg-slate-900 hover:bg-slate-800 text-white gap-1.5 rounded-lg shadow-md transition-all active:scale-95 h-8">
                  <Plus size={14} /> タグを追加
                </Button>
              </div>

              <ScrollArea className="h-[350px] pr-4">
                {assignedTags.length === 0 ? (
                  <div className="text-center py-20 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <TagIcon className="mx-auto text-slate-300 mb-2" size={32} />
                    <p className="text-sm text-slate-400 font-medium">タグが設定されていません</p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {assignedTags.map(tag => (
                      <div key={tag.tag_id} className="flex items-center gap-1.5 pl-3 pr-1 py-1 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100 group transition-all">
                        <span className="text-xs font-bold">{tag.tag_name}</span>
                        <button 
                          onClick={() => handleRemove(tag.tag_id)}
                          disabled={loading}
                          className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-indigo-200 text-indigo-400 hover:text-indigo-700 transition-colors"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter className="p-4 bg-slate-50 border-t flex justify-center">
           <p className="text-[10px] text-slate-400 font-medium italic">※ タグは教材の検索・分類に使用されます</p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}