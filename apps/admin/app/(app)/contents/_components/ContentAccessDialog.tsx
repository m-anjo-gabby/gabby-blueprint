'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Lock, Plus, X, Loader2, ArrowLeft, Building2, ShieldCheck, AlertCircle } from 'lucide-react'
import { getContentAccessData, assignAccess, removeAccess } from '@/actions/adminContentAction'
import { useToast } from '@gabby/lib/hooks/useToast'
import { Content, ContentAccessSummary } from '@gabby/types/content'

interface Props {
  content: Content
  children: React.ReactNode;
}

export function ContentAccessDialog({ content, children }: Props) {
  const [open, setOpen] = useState(false)
  const [isAddMode, setIsAddMode] = useState(false)
  const [loading, setLoading] = useState(false)
  const [assignedClients, setAssignedClients] = useState<ContentAccessSummary[]>(content.access_clients || [])
  const [unassignedClients, setUnassignedClients] = useState<ContentAccessSummary[]>([])
  const { showToast } = useToast()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getContentAccessData(content.content_id)
      setAssignedClients(data.assignedClients)
      setUnassignedClients(data.unassignedClients)
    } catch (error) {
      showToast('データ取得に失敗しました', 'error')
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

  const handleAdd = async (clientId: string) => {
    setLoading(true)
    const res = await assignAccess(content.content_id, clientId)
    if (res.success) {
      await loadData()
      showToast('アクセス権限を付与しました', 'success')
    } else {
      showToast('付与に失敗しました', 'error')
      setLoading(false)
    }
  }

  const handleRemove = async (clientId: string) => {
    setLoading(true)
    const res = await removeAccess(content.content_id, clientId)
    if (res.success) {
      await loadData()
      showToast('アクセス権限を解除しました', 'success')
    } else {
      showToast('解除に失敗しました', 'error')
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>

      <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl">
        <DialogHeader className="p-6 bg-slate-900 text-white">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <ShieldCheck className="text-amber-400" size={20} />
            {isAddMode ? '権限を追加' : 'アクセス許可済み顧客'}
          </DialogTitle>
        </DialogHeader>

        <div className="p-6 bg-white min-h-[400px]">
          {loading && assignedClients.length === 0 ? (
            <div className="flex justify-center p-20"><Loader2 className="animate-spin text-indigo-500" /></div>
          ) : isAddMode ? (
            /* --- 追加モード --- */
            <div className="space-y-4">
              <Button variant="ghost" size="sm" onClick={() => setIsAddMode(false)} className="h-8 text-slate-500 p-0 font-bold hover:bg-transparent hover:text-indigo-600">
                <ArrowLeft size={16} className="mr-1" /> 戻る
              </Button>
              <ScrollArea className="h-[350px] pr-4">
                {unassignedClients.length === 0 ? (
                  <div className="text-center py-20 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200 px-6">
                    <Building2 className="mx-auto text-slate-200 mb-2" size={32} />
                    <p className="text-xs text-slate-400 font-bold leading-relaxed">追加できる顧客がいません</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {unassignedClients.map(client => (
                      <div key={client.client_id} className="flex items-center justify-between p-3 border rounded-2xl bg-slate-50/30 group hover:border-indigo-200 transition-colors">
                        <span className="text-sm font-bold text-slate-700">{client.client_name}</span>
                        <Button size="sm" onClick={() => handleAdd(client.client_id)} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 h-8 rounded-xl font-bold">追加</Button>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          ) : (
            /* --- 一覧モード --- */
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Authorized Clients</p>
                <Button size="sm" onClick={() => setIsAddMode(true)} className="bg-slate-900 hover:bg-slate-800 text-white gap-1.5 rounded-xl h-8 font-bold shadow-md active:scale-95 transition-all">
                  <Plus size={14} /> 顧客を追加
                </Button>
              </div>

              <ScrollArea className="h-[350px] pr-4">
                {assignedClients.length === 0 ? (
                  <div className="text-center py-20 bg-amber-50/50 rounded-3xl border border-dashed border-amber-200 px-6">
                    <AlertCircle className="mx-auto text-amber-300 mb-2" size={32} />
                    <p className="text-xs text-amber-600 font-bold leading-relaxed">
                      割当がありません。<br />
                      現在、どの顧客も閲覧できない状態です。
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {assignedClients.map(client => (
                      <div key={client.client_id} className="flex items-center justify-between p-3 border border-indigo-100 rounded-2xl bg-indigo-50/30 group">
                        <div className="flex items-center gap-2">
                          <Building2 size={16} className="text-indigo-400" />
                          <span className="text-sm font-bold text-indigo-900">{client.client_name}</span>
                        </div>
                        <button onClick={() => handleRemove(client.client_id)} disabled={loading} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-rose-100 text-indigo-300 hover:text-rose-600 transition-all">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}