'use server';

import { createAdminClient } from '@/lib/admin';
import { revalidatePath } from 'next/cache';

// Azure SDK を使用する場合のインポート（仮定）
// import * as sdk from "microsoft-cognitiveservices-speech-sdk";

/**
 * 1. プレビュー再生用 (DB保存なし)
 * SSMLを受け取り、Azureから生成された音声バイナリをBase64で返す
 */
export async function previewTTS(ssml: string) {
  try {
    console.log("Azure TTS Preview for SSML:", ssml);

    // --- Azure TTS API 呼び出し (擬似コード) ---
    // 本来はここで SDK を使い、AudioData を取得します
    // const audioData = await callAzureTTS(ssml); 
    
    // テスト用のダミーレスポンス (1秒程度の無音、または固定MP3のBase64)
    const dummyBase64 = "SUQzBAAAAAAAV1RFT..." 
    
    return { 
      success: true, 
      audioData: dummyBase64 
    };
  } catch (error) {
    console.error("TTS Preview Error:", error);
    return { success: false, message: "音声の生成に失敗しました" };
  }
}

/**
 * 2. 確定保存用 (Storage保存 + DB更新)
 */
export async function generateAndSaveTTS(phraseId: string, ssml: string) {
  const supabase = createAdminClient();

  try {
    // A. Azure TTS で音声ファイルを生成 (Buffer)
    // const audioBuffer = await callAzureTTSAsBuffer(ssml);
    const dummyBuffer = Buffer.from([]); // 仮のバッファ

    // B. Supabase Storage にアップロード
    const fileName = `${phraseId}_${Date.now()}.mp3`;
    const filePath = `tts/${fileName}`;

    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('media') // 任意のバケット名
      .upload(filePath, dummyBuffer, {
        contentType: 'audio/mpeg',
        upsert: true
      });

    if (uploadError) throw uploadError;

    // C. DB (com_m_phrase) の情報を更新
    const { error: dbError } = await supabase
      .from('com_m_phrase')
      .update({
        tts_ssml: ssml,
        audio_path: filePath,
        tts_status: 1, // 完了
        last_tts_date: new Date().toISOString()
      })
      .eq('phrase_id', phraseId);

    if (dbError) throw dbError;

    return { success: true, path: filePath };
  } catch (error) {
    console.error("TTS Save Error:", error);
    return { success: false, message: "保存処理に失敗しました" };
  }
}