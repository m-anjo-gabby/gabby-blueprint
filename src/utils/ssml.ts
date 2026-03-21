// utils/ssml.ts
import { TTSAdjustmentData, WordAdjustment } from '@/types/word';

export function buildSSML(phraseText: string, data: TTSAdjustmentData): string {
  const { settings, words } = data;
  const { voice, style, rate, pitch } = settings;
  const pitchStr = pitch >= 0 ? `+${pitch}%` : `${pitch}%`;

  // words が空（再生フックからの簡易呼び出しなど）の場合は、
  // phraseText をそのまま使い、words がある場合のみタグ付けループを回す
  const processedText = (words && words.length > 0)
    ? words.map(adj => {
        let segment = adj.fullText;
        if (adj.ipa.trim()) {
          const punctuation = adj.fullText.slice(adj.text.length);
          segment = `<phoneme alphabet="ipa" ph="${adj.ipa.trim()}">${adj.text}</phoneme>${punctuation}`;
        }
        if (adj.emphasis) {
          segment = `<emphasis level="${adj.emphasisLevel}">${segment}</emphasis>`;
        }
        if (adj.breakAfter) {
          segment = `${segment}<break time="${adj.breakDuration}ms"/>`;
        }
        return segment;
      }).join(' ')
    : phraseText; // words が空なら原文をそのまま使用

  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="en-US">
      <voice name="${voice}">
        <mstts:express-as style="${style}">
          <prosody rate="${rate}" pitch="${pitchStr}">${processedText}</prosody>
        </mstts:express-as>
      </voice>
    </speak>`;
}