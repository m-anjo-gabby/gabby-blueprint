'use server';

import { createAdminClient } from '@gabby/lib/supabase/admin';
import { generateAzureAudioBuffer, generateTTSFileName } from '@gabby/lib/azure/tts';
import { revalidatePath } from 'next/cache';

/**
 * 単語ドリルエディタ保存処理
 * audioバケットへの音声生成 + 保存 + DB更新 (com_m_phrase)
 */
export async function savePhrase(
  phraseId: string,
  wordId: string,
  ssml: string,
  mode: 'auto' | 'manual',
  adjustmentData: any,             // TTSAdjustmentData
  currentAudioPath?: string | null // フロントから現在のパスを受け取る
) {
  const supabase = createAdminClient();

  try {
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

    if (uploadError) throw uploadError;

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

    if (dbError) throw dbError;

    // 5. 古いファイルがあれば削除（後始末）
    // セキュリティチェック：渡されたパスが本当にこのフレーズのものか検証
    if (currentAudioPath && currentAudioPath !== newFilePath) {
      if (currentAudioPath.includes(phraseId)) {
        await supabase.storage.from('audio').remove([currentAudioPath]);
      } else {
        console.error(`Warning: Attempted to delete invalid path. phraseId: ${phraseId}, path: ${currentAudioPath}`);
      }
    }

    return { 
      success: true, 
      message: "音声を更新しました", 
      path: newFilePath 
    };

  } catch (error: any) {
    console.error("TTS Save Error (Phrase):", error);
    return { success: false, message: error.message || "保存に失敗しました" };
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
  const supabase = createAdminClient();

  try {
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

    if (uploadError) throw uploadError;

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

    if (dbError) throw dbError;

    // 履歴一覧を再検証
    revalidatePath('/tools/tts-designer');

    return { 
      success: true, 
      message: "資産を保存しました", 
      data 
    };

  } catch (error: any) {
    console.error("TTS Save Error (Asset):", error);
    return { success: false, message: error.message || "資産の保存に失敗しました" };
  }
}

/**
 * 汎用音声ファイル削除
 * DBレコードの削除 + Storage上の物理ファイル削除
 */
export async function deleteTTSAssetAction(assetId: string, audioPath: string) {
  const supabase = createAdminClient();

  try {
    // 1. DBレコード削除
    const { error: dbError } = await supabase
      .from('com_t_tts_asset')
      .delete()
      .eq('asset_id', assetId);

    if (dbError) throw dbError;

    // 2. Storage上の物理ファイルを削除 (一過性要件に基づき確実に掃除)
    if (audioPath) {
      const { error: storageError } = await supabase.storage
        .from('audio')
        .remove([audioPath]);
      
      if (storageError) {
        console.warn("Storage deletion failed, but DB record was removed:", storageError);
      }
    }

    revalidatePath('/tools/tts-designer');
    return { success: true, message: "削除しました" };

  } catch (error: any) {
    console.error("TTS Delete Error:", error);
    return { success: false, message: error.message || "削除に失敗しました" };
  }
}