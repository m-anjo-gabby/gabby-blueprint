'use server';

import { createAdminClient } from '@/lib/admin';
import { WordAdjustment } from '@/types/word';
import { revalidatePath } from 'next/cache';
import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";

/**
 * Azure Speech Service を使って SSML から音声バッファを生成する (Server-side)
 */
async function synthesizeAudio(ssml: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(
      process.env.NEXT_PUBLIC_AZURE_SPEECH_SERVICE_KEY!,
      process.env.NEXT_PUBLIC_AZURE_SPEECH_REGION || "japaneast"
    );

    // 16kHz, 32kbps, Mono の MP3 フォーマットを指定
    // これにより、音声ファイルの容量を抑える
    speechConfig.speechSynthesisOutputFormat =
      SpeechSDK.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

    // サーバーサイドなので出力先はメモリ(PullAudioOutputStream)を指定
    const synthesizer = new SpeechSDK.SpeechSynthesizer(speechConfig, null);

    synthesizer.speakSsmlAsync(
      ssml,
      result => {
        if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
          resolve(Buffer.from(result.audioData));
        } else {
          reject(new Error(`Azure Synthesis Error: ${result.errorDetails}`));
        }
        synthesizer.close();
      },
      err => {
        reject(err);
        synthesizer.close();
      }
    );
  });
}

/**
 * 確定保存用：audioバケットへの音声生成 + 保存 + DB更新
 */
export async function savePhrase(
  phraseId: string,
  wordId: string, // wordId を追加
  ssml: string,
  mode: 'auto' | 'manual',
  adjustments: WordAdjustment[]
) {
  const supabase = createAdminClient();

  try {
    // 1. Azure で音声合成
    const audioBuffer = await synthesizeAudio(ssml);

    // 2. audio バケットへ保存 (階層構造: words/[wordId]/phrases/)
    const filePath = `words/${wordId}/phrases/${phraseId}.mp3`;

    const { error: uploadError } = await supabase
      .storage
      .from('audio')
      .upload(filePath, audioBuffer, {
        contentType: 'audio/mpeg',
        cacheControl: '31536000',
        upsert: true
      });

    if (uploadError) throw uploadError;

    // 3. DB 更新
    const { error: dbError } = await supabase
      .from('com_m_phrase')
      .update({
        tts_ssml: ssml,
        tts_ssml_mode: mode,
        tts_adjustments: adjustments as any,
        audio_path: filePath, // 新しいパスを保存
        tts_status: 1,
        last_tts_date: new Date().toISOString(),
        update_date: new Date().toISOString()
      })
      .eq('phrase_id', phraseId);

    if (dbError) throw dbError;

    // クライアント側で refresh/fetch するため revalidatePath は不要
    return { 
      success: true, 
      message: "音声を生成し、保存しました",
      path: filePath 
    };

  } catch (error: any) {
    console.error("TTS Save Error:", error);
    return { success: false, message: error.message || "保存に失敗しました" };
  }
}