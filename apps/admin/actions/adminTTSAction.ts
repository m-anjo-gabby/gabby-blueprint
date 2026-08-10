'use server';

import { createAdminClient } from '@gabby/lib/supabase/admin';
import { generateAzureAudioBuffer, generateTTSFileName } from '@gabby/lib/azure/tts';
import { revalidatePath } from 'next/cache';
import { createLogger } from '@gabby/lib/logger';
import { getLogContext } from '@gabby/lib/logger/context';

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
  adjustmentData: any,           // TTSAdjustmentData
  currentAudioPath?: string | null // フロントから現在のパスを受け取る
) {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    // 1. Azure で音声合成 (共通エンジンを利用)
    const audioBuffer = await generateAzureAudioBuffer(ssml);

    // 2. 新しいファイルパスの生成（タイムスタンプ付き：既存の命名規則を維持）
    const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
    const newFilePath = `words/${wordId}/phrases/${phraseId}-${timestamp}.mp3`;

    // 3. 新規アップロード
    const { error: uploadError } = await supabase.storage
      .from('audio')
      .upload(newFilePath, audioBuffer, {
        contentType: 'audio/mpeg',
        cacheControl: '31536000',
        upsert: false
      });

    if (uploadError) {
      logger.error('tts:upload_failed', uploadError.message, { ...ctx, payload: { phraseId, wordId, newFilePath } });
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
        update_date: new Date().toISOString()
      })
      .eq('phrase_id', phraseId);

    if (dbError) {
      logger.error('tts:db_update_failed', dbError.message, { ...ctx, payload: { phraseId, wordId, newFilePath } });
      // ロールバック的な処理（アップロードしたばかりのファイルを消す）
      await supabase.storage.from('audio').remove([newFilePath]);
      throw dbError;
    }

    // 5. 古いファイルがあれば削除（後始末）
    if (currentAudioPath && currentAudioPath !== newFilePath) {
      if (currentAudioPath.includes(phraseId)) {
        await supabase.storage.from('audio').remove([currentAudioPath]);
      } else {
        logger.warn('tts:invalid_delete_path', `Attempted to delete invalid path. phraseId: ${phraseId}, path: ${currentAudioPath}`, ctx);
      }
    }

    logger.info('tts:save_phrase_success', `Phrase audio updated: ${phraseId}`, { 
      ...ctx,
      payload: { phraseId, wordId, path: newFilePath } 
    });

    return { 
      success: true, 
      message: "音声を更新しました", 
      path: newFilePath 
    };

  } catch (error) {
    logger.error("tts:save_phrase_unexpected", error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { phraseId, wordId } });
    return { success: false, message: "予期せぬエラーが発生しました" };
  }
}

/**
 * 汎用音声作成用保存処理
 * 自由入力フレーズの音声生成 + 履歴保存 (com_t_tts_asset)
 */
export async function saveTTSAssetAction(payload: {
  raw_text: string;
  comment?: string;
  ssml: string;
  mode: 'auto' | 'manual';
  adjustments: any;
}) {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    // 1. Azure で音声合成
    const audioBuffer = await generateAzureAudioBuffer(payload.ssml);

    // 2. 汎用ツール用ディレクトリ (designer/) へのパス生成
    const fileName = generateTTSFileName('asset');
    const filePath = `designer/${fileName}`;

    // 3. Storage アップロード
    const { error: uploadError } = await supabase.storage
      .from('audio')
      .upload(filePath, audioBuffer, {
        contentType: 'audio/mpeg',
        cacheControl: '31536000'
      });

    if (uploadError) {
      logger.error('tts:asset_upload_failed', uploadError.message, { ...ctx, payload: { ...payload, filePath } });
      throw uploadError;
    }

    // 4. DB 登録 (com_t_tts_asset)
    const { data, error: dbError } = await supabase
      .from('com_t_tts_asset')
      .insert([{
        raw_text: payload.raw_text,
        comment: payload.comment,
        audio_path: filePath,
        tts_ssml: payload.ssml,
        tts_ssml_mode: payload.mode,
        tts_adjustments: payload.adjustments
      }])
      .select()
      .single();

    if (dbError) {
      logger.error('tts:asset_db_insert_failed', dbError.message, { ...ctx, payload: { ...payload, filePath } });
      // ロールバック
      await supabase.storage.from('audio').remove([filePath]);
      throw dbError;
    }

    logger.info('tts:save_asset_success', `TTS Asset saved: ${payload.raw_text.slice(0, 20)}...`, { 
      ...ctx,
      payload: { assetId: data.asset_id, path: filePath } 
    });

    revalidatePath('/tools/tts-designer');

    return { 
      success: true, 
      message: "資産を保存しました", 
      data 
    };

  } catch (error) {
    logger.error("tts:save_asset_unexpected", error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload });
    return { success: false, message: "予期せぬエラーが発生しました" };
  }
}

/**
 * 汎用音声ファイル削除
 * DBレコードの削除 + Storage上の物理ファイル削除
 */
export async function deleteTTSAssetAction(assetId: string, audioPath: string) {
  const ctx = await getLogContext();
  try {
    const supabase = await createAdminClient();

    // 1. DBレコード削除
    const { error: dbError } = await supabase
      .from('com_t_tts_asset')
      .delete()
      .eq('asset_id', assetId);

    if (dbError) {
      logger.error('tts:asset_delete_failed', dbError.message, { ...ctx, payload: { assetId, audioPath } });
      throw dbError;
    }

    // 2. Storage上の物理ファイルを削除
    if (audioPath) {
      const { error: storageError } = await supabase.storage
        .from('audio')
        .remove([audioPath]);
      
      if (storageError) {
        logger.warn("tts:asset_storage_delete_failed", `Storage deletion failed, but DB record was removed: ${storageError.message}`, { ...ctx, payload: { assetId, audioPath } });
      }
    }

    logger.info('tts:delete_asset_success', `TTS Asset deleted`, { 
      ...ctx,
      payload: { assetId, audioPath } 
    });

    revalidatePath('/tools/tts-designer');
    return { success: true, message: "削除しました" };

  } catch (error) {
    logger.error("tts:delete_asset_unexpected", error instanceof Error ? error.message : 'Unknown error', { ...ctx, payload: { assetId, audioPath } });
    return { success: false, message: "予期せぬエラーが発生しました" };
  }
}