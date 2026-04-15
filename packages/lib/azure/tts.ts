// packages/lib/azure/tts.ts

import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";

/**
 * Azure Speech Service を使用して SSML から音声バッファを生成する
 */
export async function generateAzureAudioBuffer(ssml: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(
      process.env.AZURE_SPEECH_SERVICE_KEY!,
      process.env.AZURE_SPEECH_REGION || "japaneast"
    );

    // 低ビットレートMP3を指定して容量削減
    speechConfig.speechSynthesisOutputFormat =
      SpeechSDK.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

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
 * タイムスタンプ付きのユニークなファイル名を生成する
 */
export function generateTTSFileName(prefix: string = 'tts'): string {
  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  return `${prefix}_${timestamp}.mp3`;
}