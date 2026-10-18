'use server';

import { createAdminClient } from '@gabby/lib/supabase/admin';
import { generateAzureAudioBuffer, generateTTSFileName } from '@gabby/lib/azure/tts';
import { revalidatePath } from 'next/cache';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';
import { ilikeAny } from '@gabby/lib/supabase/ilike';
import { toRange, type ListParams, type ListResult } from '@/lib/list';
import type { TTSAdjustmentData, TTSAssetAdjustments } from '@gabby/types/word';
import { getErrorMessage } from '@gabby/lib/logger/errorMessage';
import { getTranslations } from 'next-intl/server';
import type { ActionResult } from '@gabby/types/action';
import type { TableRow } from '@gabby/types/db';

const logger = createLogger('admin');

/**
 * 単語ドリルエディタ保存処理
 * audioバケットへの音声生成 + 保存 + DB更新 (com_m_phrase)
 */
export async function savePhrase(
  phraseId: string,
  wordId: string,
  ssml: string,
  mode: 'auto' | 'manual',
  adjustmentData: TTSAdjustmentData,
  currentAudioPath?: string | null, // フロントから現在のパスを受け取る
): Promise<ActionResult<{ message: string; path: string }>> {
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    // 1. Azure で音声合成 (共通エンジンを利用)
    const audioBuffer = await generateAzureAudioBuffer(ssml);

    // 2. 新しいファイルパスの生成（タイムスタンプ付き：既存の命名規則を維持）
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:T.Z]/g, '')
      .slice(0, 14);
    const newFilePath = `words/${wordId}/phrases/${phraseId}-${timestamp}.mp3`;

    // 3. 新規アップロード
    const { error: uploadError } = await supabase.storage.from('audio').upload(newFilePath, audioBuffer, {
      contentType: 'audio/mpeg',
      cacheControl: '31536000',
      upsert: false,
    });

    if (uploadError) {
      logger.error('tts:upload_failed', uploadError.message, {
        ...ctx,
        err: uploadError,
        payload: { phraseId, wordId, newFilePath },
      });
      throw uploadError;
    }

    // 4. DB 更新 (com_m_phrase)
    const { error: dbError } = await supabase
      .from('com_m_phrase')
      .update({
        tts_ssml: ssml,
        tts_ssml_mode: mode,
        tts_adjustments: adjustmentData,
        audio_path: newFilePath,
        tts_status: 1,
        last_tts_date: new Date().toISOString(),
        update_date: new Date().toISOString(),
      })
      .eq('phrase_id', phraseId);

    if (dbError) {
      logger.error('tts:db_update_failed', dbError.message, {
        ...ctx,
        err: dbError,
        payload: { phraseId, wordId, newFilePath },
      });
      // ロールバック的な処理（アップロードしたばかりのファイルを消す）
      await supabase.storage.from('audio').remove([newFilePath]);
      throw dbError;
    }

    // 5. 古いファイルがあれば削除（後始末）
    if (currentAudioPath && currentAudioPath !== newFilePath) {
      if (currentAudioPath.includes(phraseId)) {
        await supabase.storage.from('audio').remove([currentAudioPath]);
      } else {
        logger.warn(
          'tts:invalid_delete_path',
          `Attempted to delete invalid path. phraseId: ${phraseId}, path: ${currentAudioPath}`,
          ctx,
        );
      }
    }

    logger.info('tts:save_phrase_success', `Phrase audio updated: ${phraseId}`, {
      ...ctx,
      payload: { phraseId, wordId, path: newFilePath },
    });

    return {
      success: true,
      message: t('common.results.audioUpdated'),
      path: newFilePath,
    };
  } catch (error) {
    logger.error('tts:save_phrase_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { phraseId, wordId },
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/**
 * 汎用音声作成用保存処理
 * 自由入力フレーズの音声生成 + 履歴保存 (com_t_tts_asset)
 */
export async function saveTTSAsset(payload: {
  raw_text: string;
  comment?: string;
  ssml: string;
  mode: 'auto' | 'manual';
  adjustments: TTSAssetAdjustments;
}): Promise<ActionResult<{ message: string; data: TableRow<'com_t_tts_asset'> }>> {
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    // 1. Azure で音声合成
    const audioBuffer = await generateAzureAudioBuffer(payload.ssml);

    // 2. 汎用ツール用ディレクトリ (designer/) へのパス生成
    const fileName = generateTTSFileName('asset');
    const filePath = `designer/${fileName}`;

    // 3. Storage アップロード
    const { error: uploadError } = await supabase.storage.from('audio').upload(filePath, audioBuffer, {
      contentType: 'audio/mpeg',
      cacheControl: '31536000',
    });

    if (uploadError) {
      logger.error('tts:asset_upload_failed', uploadError.message, {
        ...ctx,
        err: uploadError,
        payload: { ...payload, filePath },
      });
      throw uploadError;
    }

    // 4. DB 登録 (com_t_tts_asset)
    const { data, error: dbError } = await supabase
      .from('com_t_tts_asset')
      .insert([
        {
          raw_text: payload.raw_text,
          comment: payload.comment,
          audio_path: filePath,
          tts_ssml: payload.ssml,
          tts_ssml_mode: payload.mode,
          tts_adjustments: payload.adjustments,
        },
      ])
      .select()
      .single();

    if (dbError) {
      logger.error('tts:asset_db_insert_failed', dbError.message, {
        ...ctx,
        err: dbError,
        payload: { ...payload, filePath },
      });
      // ロールバック
      await supabase.storage.from('audio').remove([filePath]);
      throw dbError;
    }

    logger.info('tts:save_asset_success', `TTS Asset saved: ${payload.raw_text.slice(0, 20)}...`, {
      ...ctx,
      payload: { assetId: data.asset_id, path: filePath },
    });

    revalidatePath('/tools/tts-designer');

    return {
      success: true,
      message: t('tools.ttsDesigner.results.assetSaved'),
      data,
    };
  } catch (error) {
    logger.error('tts:save_asset_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload,
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}

/** 汎用音声（TTS Designer の履歴）の一覧の行 */
export interface TTSAssetListItem {
  asset_id: string;
  raw_text: string;
  comment: string | null;
  audio_path: string | null;
  created_at: string;
}

/**
 * 汎用音声の一覧取得（ページネーション・フレーズ/コメントの部分一致検索。新しい順）
 */
export async function getTTSAssets(params: ListParams): Promise<ListResult<TTSAssetListItem>> {
  const ctx = await getLogContext();
  const { q } = params;
  try {
    const supabase = createAdminClient();
    const [from, to] = toRange(params);
    let query = supabase
      .from('com_t_tts_asset')
      .select('asset_id, raw_text, comment, audio_path, created_at', { count: 'exact' });
    if (q) {
      query = query.or(ilikeAny(['raw_text', 'comment'], q));
    }
    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .order('asset_id', { ascending: true }) // 同順位の並びを一意に固定し、range(LIMIT/OFFSET)でのページ間の重複・欠落を防ぐ
      .range(from, to);

    if (error) {
      logger.error('tts:get_assets_failed', error.message, { ...ctx, err: error, payload: { from, to } });
      throw error;
    }
    return { rows: data ?? [], totalCount: count || 0 };
  } catch (error) {
    logger.error('tts:get_assets_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
    });
    throw error instanceof Error ? error : new Error('予期せぬエラーが発生しました');
  }
}

/**
 * 汎用音声ファイル削除
 * DBレコードの削除 + Storage上の物理ファイル削除（削除するファイルは画面から受け取らず、削除したレコードのパスを使う）
 */
export async function deleteTTSAsset(assetId: string): Promise<ActionResult<{ message: string }>> {
  const t = await getTranslations();
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    // 1. DBレコード削除（物理ファイルのパスを受け取る）
    const { data: deleted, error: dbError } = await supabase
      .from('com_t_tts_asset')
      .delete()
      .eq('asset_id', assetId)
      .select('audio_path')
      .maybeSingle();

    if (dbError) {
      logger.error('tts:asset_delete_failed', dbError.message, { ...ctx, err: dbError, payload: { assetId } });
      throw dbError;
    }
    const audioPath = deleted?.audio_path ?? null;

    // 2. Storage上の物理ファイルを削除
    if (audioPath) {
      const { error: storageError } = await supabase.storage.from('audio').remove([audioPath]);

      if (storageError) {
        logger.warn(
          'tts:asset_storage_delete_failed',
          `Storage deletion failed, but DB record was removed: ${storageError.message}`,
          { ...ctx, payload: { assetId, audioPath } },
        );
      }
    }

    logger.info('tts:delete_asset_success', `TTS Asset deleted`, {
      ...ctx,
      payload: { assetId, audioPath },
    });

    revalidatePath('/tools/tts-designer');
    return { success: true, message: t('common.results.deleted') };
  } catch (error) {
    logger.error('tts:delete_asset_unexpected', getErrorMessage(error), {
      ...ctx,
      err: error,
      payload: { assetId },
    });
    return { success: false, message: t('common.errors.unexpected') };
  }
}
