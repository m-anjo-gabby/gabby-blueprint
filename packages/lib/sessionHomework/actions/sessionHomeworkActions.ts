'use server';

import { unstable_rethrow } from 'next/navigation';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { getErrorMessage } from '@gabby/lib/logger/errorMessage';
import { getAuthUser } from '@gabby/lib/supabase/authUser';
import { createServerClient } from '@gabby/lib/supabase/server';
import {
  type AddHomeworkCommentResult,
  type CreateSessionHomeworkResult,
  type GetLatestSessionHomeworkResult,
  type GetRecentSessionHomeworkResult,
  type GetSessionHomeworkResult,
  type PendingHomeworkAttachment,
  type SessionHomeworkAttachment,
  type SessionHomeworkComment,
  type SessionHomeworkEntry,
  type SetHomeworkNotNeededResult,
} from '@gabby/types/sessionHomework';

const logger = createLogger('common');

const ATTACHMENT_SELECT = 'com_t_session_homework_attachment(*)';
const HOMEWORK_SELECT_WITH_COMMENTS = `*, ${ATTACHMENT_SELECT}, com_t_session_homework_comment(*, ${ATTACHMENT_SELECT})`;

type RawAttachmentRow = SessionHomeworkAttachment;
type RawCommentRow = Omit<SessionHomeworkComment, 'attachments'> & {
  com_t_session_homework_attachment?: RawAttachmentRow[] | null;
};
type RawHomeworkRow = Omit<SessionHomeworkEntry, 'attachments' | 'comments'> & {
  com_t_session_homework_attachment?: RawAttachmentRow[] | null;
  com_t_session_homework_comment?: RawCommentRow[] | null;
};

function normalizeHomeworkRow(row: RawHomeworkRow): SessionHomeworkEntry {
  const { com_t_session_homework_attachment, com_t_session_homework_comment, ...rest } = row;
  const comments = (com_t_session_homework_comment ?? [])
    .map((c) => {
      const { com_t_session_homework_attachment: commentAttachments, ...commentRest } = c;
      return { ...commentRest, attachments: commentAttachments ?? [] };
    })
    .sort((a, b) => (a.insert_date < b.insert_date ? 1 : -1));

  return { ...rest, attachments: com_t_session_homework_attachment ?? [], comments };
}

/**
 * 指定session_idの宿題本体（フォローアップコメントの親）を取得する
 * （コーチ本人・対象生徒本人・管理者のみRLSにより閲覧可能）。1セッション1件のため、
 * 未投稿の場合はhomework: nullを返す。
 */
export async function getSessionHomeworkCore(sessionId: string): Promise<GetSessionHomeworkResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const user = await getAuthUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data, error } = await supabase
      .from('com_t_session_homework')
      .select(HOMEWORK_SELECT_WITH_COMMENTS)
      .eq('session_id', sessionId)
      .maybeSingle();

    if (error) {
      logger.error('sessionHomework:get_homework_failed', error.message, {
        ...ctx,
        err: error,
        userId: user.id,
        payload: { sessionId },
      });
      return { success: false, errorCode: 'unexpected_error' };
    }

    return { success: true, homework: data ? normalizeHomeworkRow(data) : null };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('sessionHomework:get_homework_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
    });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * セッション準備/実施ハブ向け。指定セッションを除く、直近の宿題本体を新しい順に取得する
 * （「前回の宿題」を通話前に振り返れるようにするため）。生徒が最新の追記を見たかを出すため、
 * フォローアップコメントも取得する（件数は直近の数件に限るため軽い）。
 */
export async function getRecentSessionHomeworkCore(
  studentId: string,
  excludeSessionId: string,
  limit = 3,
): Promise<GetRecentSessionHomeworkResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const user = await getAuthUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data, error } = await supabase
      .from('com_t_session_homework')
      .select(HOMEWORK_SELECT_WITH_COMMENTS)
      .eq('coach_id', user.id)
      .eq('student_id', studentId)
      .neq('session_id', excludeSessionId)
      .order('insert_date', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error('sessionHomework:get_recent_homework_failed', error.message, {
        ...ctx,
        err: error,
        userId: user.id,
        payload: { studentId },
      });
      return { success: false, errorCode: 'unexpected_error' };
    }

    const entries: SessionHomeworkEntry[] = (data ?? []).map((row) => normalizeHomeworkRow(row));

    return { success: true, entries };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('sessionHomework:get_recent_homework_unexpected', getErrorMessage(err), { ...ctx, err });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 生徒のホームのライブセッションのカード向け。ログイン中の生徒の、指定した契約（チケット）のセッションに出された
 * 最新の宿題を、セッションの日時・コーチ名・フォローアップコメントとともに取得する（セッション結果画面へ行かずに読めるようにするため）。
 */
export async function getMyLatestSessionHomeworkCore(ticketId: string): Promise<GetLatestSessionHomeworkResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const user = await getAuthUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { data, error } = await supabase
      .from('com_t_session_homework')
      .select(
        `${HOMEWORK_SELECT_WITH_COMMENTS}, session:com_t_session!inner(ticket_id, start_datetime), coach:com_m_user!com_t_session_homework_coach_id_fkey(user_name)`,
      )
      .eq('student_id', user.id)
      .eq('session.ticket_id', ticketId)
      .order('insert_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.error('sessionHomework:get_latest_homework_failed', error.message, {
        ...ctx,
        err: error,
        userId: user.id,
        payload: { ticketId },
      });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (!data) return { success: true, homework: null };

    const { session, coach, ...row } = data;
    return {
      success: true,
      homework: {
        ...normalizeHomeworkRow(row),
        session_start_datetime: session.start_datetime,
        coach_name: coach?.user_name ?? null,
      },
    };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('sessionHomework:get_latest_homework_unexpected', getErrorMessage(err), { ...ctx, err });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 宿題本体を新規作成する（コーチのみ、1セッション1件）。session_idからcoach_id/student_idを
 * サーバー側で解決し、ログイン中コーチが対象セッションの担当コーチであることを検証してから
 * 投稿する（RLSのINSERT WITH CHECKでも同等の検証が行われるが、ここでも明示的にチェックして
 * わかりやすいエラーを返す）。本体テキストと同時に、添付ファイル
 * （事前にuploadSessionHomeworkAttachmentでアップロード済み）をまとめて登録する。
 * 既に本体が存在する場合（UNIQUE制約違反）はerrorCode: 'already_exists'を返す。
 */
export async function createSessionHomeworkCore(
  sessionId: string,
  homeworkText: string,
  attachments: PendingHomeworkAttachment[] = [],
): Promise<CreateSessionHomeworkResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const user = await getAuthUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const trimmedText = homeworkText.trim();
    if (!trimmedText) {
      return { success: false, errorCode: 'invalid_input' };
    }

    const { data: session, error: sessionError } = await supabase
      .from('com_t_session')
      .select('coach_id, student_id')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (sessionError || !session) {
      logger.error(
        'sessionHomework:create_homework_session_lookup_failed',
        sessionError?.message ?? 'session not found',
        { ...ctx, err: sessionError, userId: user.id, payload: { sessionId } },
      );
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (session.coach_id !== user.id) {
      return { success: false, errorCode: 'forbidden' };
    }

    const { data: homeworkRow, error } = await supabase
      .from('com_t_session_homework')
      .insert({
        session_id: sessionId,
        coach_id: user.id,
        student_id: session.student_id,
        homework_text: trimmedText,
      })
      .select('*')
      .single();

    if (error || !homeworkRow) {
      const errorCode = error?.code === '23505' ? 'already_exists' : 'unexpected_error';
      logger.error('sessionHomework:create_homework_failed', error?.message ?? 'No row inserted', {
        ...ctx,
        err: error,
        userId: user.id,
        payload: { sessionId },
      });
      return { success: false, errorCode };
    }

    let attachmentRows: SessionHomeworkAttachment[] = [];
    if (attachments.length > 0) {
      const { data, error: attachmentError } = await supabase
        .from('com_t_session_homework_attachment')
        .insert(
          attachments.map((a) => ({
            homework_id: homeworkRow.homework_id,
            file_path: a.file_path,
            file_name: a.file_name,
            file_type: a.file_type,
            file_size: a.file_size,
          })),
        )
        .select('*');

      if (attachmentError) {
        logger.error('sessionHomework:create_homework_attachments_failed', attachmentError.message, {
          ...ctx,
          err: attachmentError,
          userId: user.id,
          payload: { sessionId, homeworkId: homeworkRow.homework_id },
        });
      } else {
        attachmentRows = data;
      }
    }

    logger.info('sessionHomework:create_homework_success', 'Homework posted', {
      ...ctx,
      userId: user.id,
      payload: { sessionId },
    });
    return {
      success: true,
      entry: { ...homeworkRow, attachments: attachmentRows, comments: [] } as SessionHomeworkEntry,
    };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('sessionHomework:create_homework_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
    });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 宿題本体へのフォローアップコメントを追加する（コーチのみ）。宿題本体が未投稿の場合は
 * errorCode: 'not_found'を返す。添付ファイルは事前にuploadSessionHomeworkAttachmentで
 * アップロード済みのPendingHomeworkAttachment配列を受け取る。
 */
export async function addHomeworkCommentCore(
  sessionId: string,
  commentText: string,
  attachments: PendingHomeworkAttachment[] = [],
): Promise<AddHomeworkCommentResult> {
  const ctx = await getLogContext();

  try {
    const supabase = await createServerClient();
    const user = await getAuthUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const trimmed = commentText.trim();
    if (!trimmed && attachments.length === 0) {
      return { success: false, errorCode: 'invalid_input' };
    }

    const { data: homework, error: homeworkError } = await supabase
      .from('com_t_session_homework')
      .select('homework_id, coach_id')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (homeworkError) {
      logger.error('sessionHomework:add_comment_homework_lookup_failed', homeworkError.message, {
        ...ctx,
        err: homeworkError,
        userId: user.id,
        payload: { sessionId },
      });
      return { success: false, errorCode: 'unexpected_error' };
    }
    if (!homework) {
      return { success: false, errorCode: 'not_found' };
    }
    if (homework.coach_id !== user.id) {
      return { success: false, errorCode: 'forbidden' };
    }

    const { data: commentRow, error } = await supabase
      .from('com_t_session_homework_comment')
      .insert({
        homework_id: homework.homework_id,
        coach_id: user.id,
        comment_text: trimmed,
      })
      .select('*')
      .single();

    if (error || !commentRow) {
      logger.error('sessionHomework:add_comment_failed', error?.message ?? 'No row inserted', {
        ...ctx,
        err: error,
        userId: user.id,
        payload: { sessionId },
      });
      return { success: false, errorCode: 'unexpected_error' };
    }

    let attachmentRows: SessionHomeworkAttachment[] = [];
    if (attachments.length > 0) {
      const { data, error: attachmentError } = await supabase
        .from('com_t_session_homework_attachment')
        .insert(
          attachments.map((a) => ({
            comment_id: commentRow.comment_id,
            file_path: a.file_path,
            file_name: a.file_name,
            file_type: a.file_type,
            file_size: a.file_size,
          })),
        )
        .select('*');

      if (attachmentError) {
        logger.error('sessionHomework:add_comment_attachments_failed', attachmentError.message, {
          ...ctx,
          err: attachmentError,
          userId: user.id,
          payload: { sessionId, commentId: commentRow.comment_id },
        });
      } else {
        attachmentRows = data;
      }
    }

    logger.info('sessionHomework:add_comment_success', 'Homework comment posted', {
      ...ctx,
      userId: user.id,
      payload: { sessionId },
    });
    return { success: true, comment: { ...commentRow, attachments: attachmentRows } as SessionHomeworkComment };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('sessionHomework:add_comment_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
    });
    return { success: false, errorCode: 'unexpected_error' };
  }
}

/**
 * 生徒が宿題を開いたことを記録する（mark_session_homework_viewed RPC。対象の生徒本人の行だけを更新し、
 * 本人以外・宿題が無い場合は何もしない）。生徒のセッション結果画面をサーバーで描く時に呼ぶ。
 * 記録に失敗しても画面の表示は止めない（ログだけ残す）。
 */
export async function markSessionHomeworkViewedCore(sessionId: string): Promise<void> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const { error } = await supabase.rpc('mark_session_homework_viewed', { p_session_id: sessionId });
    if (error) {
      logger.error('sessionHomework:mark_viewed_failed', error.message, { ...ctx, err: error, payload: { sessionId } });
    }
  } catch (err) {
    unstable_rethrow(err);
    logger.error('sessionHomework:mark_viewed_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
      payload: { sessionId },
    });
  }
}

/**
 * 「今回は宿題なし」を設定・解除する（set_session_homework_not_needed RPC。担当コーチ本人・実施済みの回のみ）。
 * 設定した回はコーチのダッシュボードの Session Tasks の「Homework not posted」に出なくなる。
 */
export async function setSessionHomeworkNotNeededCore(
  sessionId: string,
  notNeeded: boolean,
): Promise<SetHomeworkNotNeededResult> {
  const ctx = await getLogContext();
  try {
    const supabase = await createServerClient();
    const user = await getAuthUser();
    if (!user) return { success: false, errorCode: 'unauthorized' };

    const { error } = await supabase.rpc('set_session_homework_not_needed', {
      p_session_id: sessionId,
      p_not_needed: notNeeded,
    });
    if (error) {
      logger.error('sessionHomework:set_not_needed_failed', error.message, {
        ...ctx,
        err: error,
        userId: user.id,
        payload: { sessionId, notNeeded },
      });
      const errorCode = error.message.includes('not authorized')
        ? 'forbidden'
        : error.message.includes('not found')
          ? 'not_found'
          : error.message.includes('not completed')
            ? 'invalid_input'
            : 'unexpected_error';
      return { success: false, errorCode };
    }

    logger.info('sessionHomework:set_not_needed_success', 'Homework not-needed flag updated', {
      ...ctx,
      userId: user.id,
      payload: { sessionId, notNeeded },
    });
    return { success: true };
  } catch (err) {
    unstable_rethrow(err);
    logger.error('sessionHomework:set_not_needed_unexpected', getErrorMessage(err), {
      ...ctx,
      err,
      payload: { sessionId },
    });
    return { success: false, errorCode: 'unexpected_error' };
  }
}
