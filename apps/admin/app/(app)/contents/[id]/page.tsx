import { notFound } from 'next/navigation';
import { getContentById } from '@/actions/adminContentAction';
import { WordEditor } from './_components/editors/WordEditor';
import { SprintEditor } from './_components/editors/SprintEditor';
import { EditorHeader } from './_components/EditorHeader';
import { SprintQuestionType } from '@gabby/types/sprint';

interface Props {
  // Next.js 15 では params と searchParams は Promise になります
  params: Promise<{ id: string }>;
  searchParams: Promise<{ wordId?: string; type?: string }>;
}

export default async function ContentDetailPage({ params, searchParams }: Props) {
  // params と searchParams を await して取り出す
  const { id: contentId } = await params;
  const { wordId, type } = await searchParams;

  // DBからコンテンツ基本情報を取得
  const content = await getContentById(contentId);

  if (!content) {
    notFound();
  }

  return (
    <div className="flex flex-col h-screen max-w-full overflow-hidden bg-slate-50">
      {/* 共通ヘッダー（タイトルや保存進捗などを表示） */}
      <EditorHeader 
        content={content} 
      />

      <main className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col">
        {content.content_type === 0 ? (
          // 単語エディター
          <WordEditor 
            contentId={contentId} 
            selectedWordId={wordId}
          />
        ) : content.content_type === 2 ? (
          <SprintEditor 
            contentId={contentId} 
            initialType={type as SprintQuestionType} 
            content={content}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-slate-400">
            このコンテンツタイプのエディタは準備中です
          </div>
        )}
      </main>
    </div>
  );
}