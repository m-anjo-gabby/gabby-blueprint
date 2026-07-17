'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@gabby/lib/hooks/useToast';
import { upsertCVDictionaryEntry, CVDictionaryEntry } from '@/actions/adminCVDictionaryAction';
import { PlusCircle, CheckCircle2, Edit, Languages } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { PART_OF_SPEECH_OPTIONS, PART_OF_SPEECH_MAP, type PartOfSpeechType } from '@gabby/types/colorVowel';

// ============================================================
// バリデーションスキーマ
// ============================================================

const entrySchema = z.object({
  word_en:                  z.string().min(1, '英単語は必須です'),
  part_of_speech:           z.string().min(1, '品詞を選択してください'),
  word_ja:                  z.string().min(1, '日本語訳は必須です'),
  syllables:                z.string().optional(),
  primary_stress_syllable:  z.string().optional(),
  stress_vowel_spelling:    z.string().optional(),
  cv_id:                    z.string().optional(),
  phonetic_spelling:        z.string().optional(),
});

type EntryFormValues = z.infer<typeof entrySchema>;

// ============================================================
// Props
// ============================================================

interface CVWordFormDialogProps {
  mode?: 'create' | 'edit';
  initialData?: CVDictionaryEntry;
  /** 編集時は word_en を固定したい場合に渡す */
  fixedWordEn?: string;
  onSuccess?: () => void;
}

// ============================================================
// Component
// ============================================================

export function CVWordFormDialog({
  mode = 'create',
  initialData,
  fixedWordEn,
  onSuccess,
}: CVWordFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const { showToast } = useToast();

  const getInitialValues = (data?: CVDictionaryEntry): EntryFormValues => {
    if (!data || mode === 'create') {
      return {
        word_en: fixedWordEn ?? '',
        part_of_speech: '',
        word_ja: '',
        syllables: '',
        primary_stress_syllable: '',
        stress_vowel_spelling: '',
        cv_id: '',
        phonetic_spelling: '',
      };
    }
    return {
      word_en: data.word_en,
      part_of_speech: data.part_of_speech,
      word_ja: data.word_ja ?? '',
      syllables: data.syllables ?? '',
      primary_stress_syllable: data.primary_stress_syllable != null ? String(data.primary_stress_syllable) : '',
      stress_vowel_spelling: data.stress_vowel_spelling ?? '',
      cv_id: data.cv_id ?? '',
      phonetic_spelling: data.phonetic_spelling ?? '',
    };
  };

  const form = useForm<EntryFormValues>({
    resolver: zodResolver(entrySchema),
    defaultValues: getInitialValues(initialData),
  });

  const { isSubmitting } = form.formState;

  const onSubmit = async (values: EntryFormValues) => {
    setServerError(null);
    try {
      const result = await upsertCVDictionaryEntry({
        word_en: values.word_en,
        part_of_speech: values.part_of_speech,
        word_ja: values.word_ja,
        syllables: values.syllables || null,
        primary_stress_syllable: values.primary_stress_syllable ? Number(values.primary_stress_syllable) : null,
        stress_vowel_spelling: values.stress_vowel_spelling || null,
        cv_id: values.cv_id || null,
        phonetic_spelling: values.phonetic_spelling || null,
      });

      if (result.success) {
        showToast(mode === 'create' ? 'エントリを登録しました' : 'エントリを更新しました', 'success');
        setOpen(false);
        onSuccess?.();
      } else {
        setServerError(result.message || '処理に失敗しました');
      }
    } catch {
      setServerError('システムエラーが発生しました');
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    setIsConfirming(false);
    setServerError(null);
    form.reset(getInitialValues(initialData));
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {mode === 'create' ? (
          <Button className="gap-1.5 font-bold shadow-sm bg-indigo-600 hover:bg-indigo-700 text-white border-none shrink-0 h-8 text-xs">
            <PlusCircle size={14} /> 単語追加
          </Button>
        ) : (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50">
            <Edit size={14} />
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-lg p-0 overflow-hidden border-none shadow-2xl focus:outline-none [&>button]:text-white [&>button]:opacity-70 [&>button:hover]:opacity-100 [&>button:focus]:ring-0 [&>button:focus]:outline-none">
        <span className="sr-only" tabIndex={0} />

        <DialogHeader className="p-6 bg-slate-900 text-white -mx-1 -mt-1 rounded-t-none border-b border-slate-800">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            {isConfirming ? (
              <><CheckCircle2 size={18} className="text-emerald-400" /> 内容の確認</>
            ) : mode === 'create' ? (
              <><PlusCircle size={18} className="text-indigo-400" /> エントリの新規登録</>
            ) : (
              <><Languages size={18} className="text-indigo-400" /> エントリの編集</>
            )}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-4 bg-white max-h-[70vh] overflow-y-auto">

            {/* 英単語 */}
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="word_en" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-black text-slate-400 uppercase tracking-widest">English Word</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-base font-bold text-slate-800 border border-slate-100">{field.value}</div>
                  ) : (
                    <FormControl>
                      <Input {...field} placeholder="target" className="rounded-xl border-slate-200 font-bold" disabled={mode === 'edit' || !!fixedWordEn} />
                    </FormControl>
                  )}
                  <FormMessage />
                </FormItem>
              )} />

              {/* 品詞 */}
              <FormField control={form.control} name="part_of_speech" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Part of Speech</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm font-bold border border-slate-100">
                      {PART_OF_SPEECH_MAP[field.value as PartOfSpeechType]?.adminLabel ?? field.value}
                    </div>
                  ) : (
                    <Select onValueChange={field.onChange} value={field.value} disabled={mode === 'edit'}>
                      <FormControl>
                        <SelectTrigger className="rounded-xl border-slate-200">
                          <SelectValue placeholder="選択..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PART_OF_SPEECH_OPTIONS.map((p) => (
                          <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* 日本語訳 */}
            <FormField control={form.control} name="word_ja" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[10px] font-black text-slate-400 uppercase tracking-widest">日本語訳</FormLabel>
                {isConfirming ? (
                  <div className="p-3 bg-slate-50 rounded-xl text-sm font-medium text-slate-600 border border-slate-100">{field.value}</div>
                ) : (
                  <FormControl>
                    <Input {...field} placeholder="標的、ターゲット" className="rounded-xl border-slate-200" />
                  </FormControl>
                )}
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-4">
              {/* 音節 */}
              <FormField control={form.control} name="syllables" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Syllables</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm font-medium border border-slate-100">{field.value || '—'}</div>
                  ) : (
                    <FormControl>
                      <Input {...field} placeholder="tar-get" className="rounded-xl border-slate-200 font-mono" />
                    </FormControl>
                  )}
                </FormItem>
              )} />

              {/* 主強勢音節 */}
              <FormField control={form.control} name="primary_stress_syllable" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Primary Stress #</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm font-medium border border-slate-100">{field.value || '—'}</div>
                  ) : (
                    <FormControl>
                      <Input {...field} type="number" min="1" placeholder="1" className="rounded-xl border-slate-200" />
                    </FormControl>
                  )}
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* ストレス母音スペリング */}
              <FormField control={form.control} name="stress_vowel_spelling" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Stress Vowel Spelling</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm font-medium border border-slate-100">{field.value || '—'}</div>
                  ) : (
                    <FormControl>
                      <Input {...field} placeholder="a" className="rounded-xl border-slate-200 font-mono" />
                    </FormControl>
                  )}
                </FormItem>
              )} />

              {/* CV ID */}
              <FormField control={form.control} name="cv_id" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-black text-slate-400 uppercase tracking-widest">CV Color ID</FormLabel>
                  {isConfirming ? (
                    <div className="p-3 bg-slate-50 rounded-xl text-sm font-medium border border-slate-100">{field.value || '—'}</div>
                  ) : (
                    <FormControl>
                      <Input {...field} placeholder="olive_sock" className="rounded-xl border-slate-200 font-mono text-sm" />
                    </FormControl>
                  )}
                </FormItem>
              )} />
            </div>

            {/* 発音記号 */}
            <FormField control={form.control} name="phonetic_spelling" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Phonetic Spelling</FormLabel>
                {isConfirming ? (
                  <div className="p-3 bg-slate-50 rounded-xl text-sm font-medium border border-slate-100 font-mono">{field.value || '—'}</div>
                ) : (
                  <FormControl>
                    <Input {...field} placeholder="/ˈtɑːrɡɪt/" className="rounded-xl border-slate-200 font-mono" />
                  </FormControl>
                )}
              </FormItem>
            )} />

            {/* アクションボタン */}
            <div className="pt-4 mt-2 border-t border-slate-100">
              {isConfirming ? (
                <div className="space-y-4">
                  <p className="text-xs font-bold text-center text-slate-400 uppercase tracking-tighter">Please confirm the details above</p>
                  {serverError && <Alert variant="destructive" className="text-xs py-2">{serverError}</Alert>}
                  <div className="flex gap-3">
                    <Button type="button" variant="ghost" className="flex-1 rounded-xl font-bold" onClick={() => setIsConfirming(false)} disabled={isSubmitting}>戻る</Button>
                    <Button type="submit" className="flex-1 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold" disabled={isSubmitting}>
                      {isSubmitting ? '保存中...' : '確定する'}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold h-11"
                  onClick={async () => { if (await form.trigger()) setIsConfirming(true); }}
                >
                  内容を確認する
                </Button>
              )}
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
