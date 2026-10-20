import { Loader2 } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { type Content } from '@gabby/types/content';
import { QUESTION_TYPES, type SprintQuestionType } from '@gabby/types/sprint';
import { getContentById } from '@/actions/adminContentAction';
import { getDialogueSessions } from '@/actions/adminDialogueAction';
import { getSprintQuestionsByFilter } from '@/actions/adminSprintAction';
import { getVideoEditorSections } from '@/actions/adminVideoAction';
import { getPhrasesByWordId, getWordsByContentId } from '@/actions/adminWordAction';
import { EditorHeader } from './_components/EditorHeader';
import { DialogueEditor } from './_components/editors/DialogueEditor';
import { SprintEditor } from './_components/editors/SprintEditor';
import { VideoEditor } from './_components/editors/VideoEditor';
import { WordEditor } from './_components/editors/WordEditor';
import { SPRINT_EDITOR_INITIAL_LEVEL } from './_lib/editorDefaults';

interface ContentDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ wordId?: string; type?: string }>;
}

function isSprintQuestionType(value: string | undefined): value is SprintQuestionType {
  return value !== undefined && Object.hasOwn(QUESTION_TYPES, value);
}

/** 教材の種別ごとのエディタ。一覧はここでサーバー取得し、エディタは編集の後だけブラウザから取り直す */
async function EditorBody({ content, wordId, type }: { content: Content; wordId?: string; type?: string }) {
  const contentId = content.content_id;

  if (content.content_type === 0) {
    const [words, phrases] = await Promise.all([
      getWordsByContentId(contentId),
      wordId ? getPhrasesByWordId(wordId) : null,
    ]);
    return (
      <WordEditor
        contentId={contentId}
        initialWords={words.success ? words.data : null}
        initialPhrases={wordId && phrases ? { wordId, phrases: phrases.success ? phrases.data : null } : null}
      />
    );
  }

  if (content.content_type === 1) {
    const res = await getVideoEditorSections(contentId);
    return <VideoEditor contentId={contentId} initialSections={res.success ? res.sections : null} />;
  }

  if (content.content_type === 2) {
    const initialType = isSprintQuestionType(type) ? type : '0';
    const questions = await getSprintQuestionsByFilter(contentId, initialType, SPRINT_EDITOR_INITIAL_LEVEL);
    return (
      <SprintEditor
        contentId={contentId}
        initialType={initialType}
        content={content}
        initialQuestions={questions.success ? questions.data : null}
      />
    );
  }

  if (content.content_type === 3) {
    const sessions = await getDialogueSessions(contentId);
    return <DialogueEditor contentId={contentId} initialSessions={sessions.success ? sessions.data : null} />;
  }

  const t = await getTranslations('contents.editor.detailPage');
  return <div className="flex items-center justify-center h-full text-slate-400">{t('notReady')}</div>;
}

export default async function ContentDetailPage({ params, searchParams }: ContentDetailPageProps) {
  const { id: contentId } = await params;
  const { wordId, type } = await searchParams;

  const content = await getContentById(contentId);
  if (!content) {
    notFound();
  }

  return (
    <div className="flex flex-col h-screen max-w-full overflow-hidden bg-slate-50">
      {/* 共通ヘッダー（タイトルや保存進捗などを表示） */}
      <EditorHeader content={content} />

      <main className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col">
        <Suspense
          fallback={
            <div className="flex flex-1 items-center justify-center text-slate-300">
              <Loader2 className="animate-spin" size={32} />
            </div>
          }
        >
          <EditorBody content={content} wordId={wordId} type={type} />
        </Suspense>
      </main>
    </div>
  );
}
