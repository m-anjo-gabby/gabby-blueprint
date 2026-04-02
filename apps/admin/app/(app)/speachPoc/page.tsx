"use client";

import { useState, useMemo } from "react";
import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";
import { useAzureSpeechTest } from "@/hooks/useAzureSpeechTest";
import { useWebSpeech } from "@gabby/lib/hooks/useWebSpeech";
import { AssessmentWord } from "@/types/azure";
import { AnalysisResult } from "@/types/wordDrill"; // AnalysisResultの型をインポート

const samplePhrases = [
  "We start fermenting the soy.",
  "We start fermenting the soy milk with a specific starter culture.",
  "We limit sucrose intake.",
  "We optionally add vitamins.",
  "We create a stable emulsion."
];

// ... voiceOptions と styleOptions は変更なしのため中略 (元のコードを維持) ...
const voiceOptions = [
  { id: "en-US-JennyNeural", name: "Jenny (米国・女性)", desc: "明るく万能・最人気" },
  { id: "en-US-AriaNeural", name: "Aria (米国・女性)", desc: "自然で柔らかい" },
  { id: "en-US-SaraNeural", name: "Sara (米国・女性)", desc: "ナチュラルで聞きやすい" },
  { id: "en-US-GuyNeural", name: "Guy (米国・男性)", desc: "落ち着いた信頼感" },
  { id: "en-US-DavisNeural", name: "Davis (米国・男性)", desc: "若く軽快" },
  { id: "en-US-TonyNeural", name: "Tony (米国・男性)", desc: "ニュース向き" },
  { id: "en-GB-SoniaNeural", name: "Sonia (英国・女性)", desc: "知的な英国アクセント" },
  { id: "en-GB-LibbyNeural", name: "Libby (英国・女性)", desc: "現代的で自然" },
  { id: "en-GB-RyanNeural", name: "Ryan (英国・男性)", desc: "フォーマル英国風" },
  { id: "en-GB-ThomasNeural", name: "Thomas (英国・男性)", desc: "重厚で落ち着き" },
  { id: "en-CA-ClaraNeural", name: "Clara (カナダ・女性)", desc: "親しみやすい" },
  { id: "en-CA-LiamNeural", name: "Liam (カナダ・男性)", desc: "力強い" },
  { id: "en-AU-NatashaNeural", name: "Natasha (豪・女性)", desc: "活発な豪州風" },
  { id: "en-AU-FreyaNeural", name: "Freya (豪・女性)", desc: "明るく自然" },
  { id: "en-AU-WilliamNeural", name: "William (豪・男性)", desc: "柔らかい豪州風" },
  { id: "en-IN-NeerjaNeural", name: "Neerja (インド・女性)", desc: "明瞭なインド英語" },
  { id: "en-IN-PrabhatNeural", name: "Prabhat (インド・男性)", desc: "力強いインド英語" },
  { id: "en-IE-EmilyNeural", name: "Emily (アイルランド・女性)", desc: "柔らかい雰囲気" },
  { id: "en-IE-ConnorNeural", name: "Connor (アイルランド・男性)", desc: "落ち着いた雰囲気" },
];

const styleOptions = [
  { id: "general", label: "Standard (標準)" },
  { id: "cheerful", label: "Cheerful (陽気)" },
  { id: "sad", label: "Sad (悲しげ)" },
  { id: "angry", label: "Angry (怒り)" },
  { id: "excited", label: "Excited (興奮)" },
  { id: "friendly", label: "Friendly (親しみ)" },
  { id: "customerservice", label: "Customer Service (接客)" },
  { id: "newscast", label: "Newscast (ニュース)" },
  { id: "newscast-casual", label: "Newscast Casual (柔らかいニュース)" },
  { id: "whispering", label: "Whispering (ささやき)" },
  { id: "shouting", label: "Shouting (叫び)" },
  { id: "narration-professional", label: "Narration Professional (朗読)" },
  { id: "empathetic", label: "Empathetic (共感的)" },
  { id: "assistant", label: "Assistant (AI風)" },
  { id: "chat", label: "Chat (会話調)" },
];

export default function SpeechPoCPage() {
  const [ttsText, setTtsText] = useState(samplePhrases[0]);
  const [evalText, setEvalText] = useState(samplePhrases[0]);
  const [voice, setVoice] = useState(voiceOptions[0].id);
  const [style, setStyle] = useState("general");
  const [rate, setRate] = useState(1.0);
  const [pitch, setPitch] = useState(0);
  const [granularity, setGranularity] = useState(SpeechSDK.PronunciationAssessmentGranularity.Phoneme);
  const [activeTab, setActiveTab] = useState<'tts' | 'assessment'>('tts');

  // WebSpeechの結果を保持するためのPOC専用ステート
  const [webSpeechResult, setWebSpeechResult] = useState<AnalysisResult | null>(null);

  const { speak: speakAzure, startAssessment, stopAssessment, resetResult, isSpeaking: isAzureSpeaking, isRecording, result, rawResult, timeLeft: timeLeftAzure, recordedAudioUrl } = useAzureSpeechTest();
  
  // 現在の useWebSpeech (正) をそのまま使用
  const { speak: speakWebSpeech, startAssessment: startAssessmentWeb, stopListening, isSpeaking: isWebSpeaking, isListening, timeLeft: timeLeftWeb } = useWebSpeech();

  const assessmentData = useMemo(() => {
    if (!rawResult) return null;
    const jsonString = rawResult.properties.getProperty(SpeechSDK.PropertyId.SpeechServiceResponse_JsonResult);
    if (!jsonString) return null;
    try {
      const parsed = JSON.parse(jsonString) as { NBest: { Words: AssessmentWord[] }[] };
      return parsed?.NBest?.[0] ? { Words: parsed.NBest[0].Words } : null;
    } catch { return null; }
  }, [rawResult]);

  return (
    <div className="p-8 mx-auto max-w-6xl space-y-8 text-slate-900">
      <h1 className="text-2xl font-bold">Azure / WebSpeech 検証ツール</h1>

      {/* タブ切り替え */}
      <div className="flex gap-4 border-b">
        <button 
          onClick={() => setActiveTab('tts')}
          className={`pb-2 px-4 font-bold transition-colors ${activeTab === 'tts' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-gray-500'}`}
        >
          読み上げテスト (TTS)
        </button>
        <button 
          onClick={() => setActiveTab('assessment')}
          className={`pb-2 px-4 font-bold transition-colors ${activeTab === 'assessment' ? 'border-b-2 border-green-600 text-green-700' : 'text-gray-500'}`}
        >
          発音評価テスト (STT)
        </button>
      </div>

      {activeTab === 'tts' ? (
        <section className="space-y-4 max-w-3xl">
          <h2 className="font-bold text-lg">・読み上げ (TTS)の比較</h2>
          <div className="border p-6 rounded-xl bg-gray-50 space-y-4">
            <h3 className="font-bold text-gray-700 text-sm">テキスト設定</h3>
            <select value={ttsText} onChange={(e) => setTtsText(e.target.value)} className="w-full p-2 border rounded text-sm bg-white">
              {samplePhrases.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <textarea value={ttsText} onChange={(e) => setTtsText(e.target.value)} className="w-full p-2 border rounded h-24 text-sm" />
          </div>

          <div className="grid grid-cols-10 gap-6">
            {/* Azure TTS */}
            <div className="col-span-7 border p-4 rounded-xl bg-blue-50/50 space-y-3">
              <h3 className="font-bold text-blue-900 text-sm">Azure TTS (高機能)</h3>
              <select value={voice} onChange={(e) => setVoice(e.target.value)} className="w-full p-2 border rounded text-xs bg-white">
                {voiceOptions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              <select value={style} onChange={(e) => setStyle(e.target.value)} className="w-full p-2 border rounded text-xs bg-white">
                {styleOptions.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <button onClick={() => speakAzure(ttsText, voice, style, rate, pitch)} disabled={isAzureSpeaking} className="w-full bg-blue-600 text-white py-2 rounded font-bold text-sm">
                {isAzureSpeaking ? "再生中..." : "Azureで再生"}
              </button>
            </div>

            {/* Web Speech TTS */}
            <div className="col-span-3 border p-4 rounded-xl bg-gray-100 space-y-3">
              <h3 className="font-bold text-gray-700 text-sm">Web Speech</h3>
              <p className="text-[10px] text-gray-500">ブラウザ標準機能</p>
              <button onClick={() => speakWebSpeech(ttsText)} disabled={isWebSpeaking} className="w-full bg-gray-600 text-white py-2 rounded text-sm">
                {isWebSpeaking ? "再生中..." : "ブラウザで再生"}
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="space-y-6">
          <h2 className="font-bold text-lg">・発音評価の比較</h2>
          <div className="border p-6 rounded-xl bg-gray-50 space-y-4">
            <select value={evalText} onChange={(e) => setEvalText(e.target.value)} className="w-full p-2 border rounded text-sm bg-white">
              {samplePhrases.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <textarea value={evalText} onChange={(e) => setEvalText(e.target.value)} className="w-full p-2 border rounded h-24 text-sm" />
            <button onClick={() => { resetResult(); setWebSpeechResult(null); }} className="text-xs text-gray-400 underline">結果をクリア</button>
          </div>

          <div className="grid grid-cols-10 gap-6">
            {/* Azure Assessment */}
            <div className="col-span-7 border p-6 rounded-xl bg-green-50/50 space-y-4">
              <h3 className="font-bold text-green-900 text-sm">Azure Assessment</h3>
              <button 
                onClick={() => isRecording ? stopAssessment() : startAssessment(evalText, granularity)}
                className={`w-full py-2 rounded font-bold text-white ${isRecording ? "bg-red-600" : "bg-green-600"}`}
              >
                {isRecording ? `録音中... (${timeLeftAzure}s)` : "Azure評価を開始"}
              </button>

              {result && (
                <div className="bg-white p-4 rounded-lg border text-center">
                  <div className="text-xs font-bold text-green-800">総合スコア: <span className="text-2xl">{result.pronunciationScore?.toFixed(1)}</span></div>
                </div>
              )}
            </div>

            {/* Web Speech (自作評価) */}
            <div className="col-span-3 border p-6 rounded-xl bg-slate-100 space-y-4">
              <h3 className="font-bold text-slate-700 text-sm">Web Speech (自作)</h3>
              <button 
                onClick={() => {
                  if (isListening) {
                    stopListening();
                  } else {
                    setWebSpeechResult(null);
                    // useWebSpeechのstartAssessmentを呼び出し、完了時に結果をステートに保存
                    startAssessmentWeb(evalText, [], (res) => {
                      setWebSpeechResult(res);
                    });
                  }
                }} 
                className={`w-full text-white py-2 rounded font-bold text-sm ${isListening ? 'bg-red-600 animate-pulse' : 'bg-slate-600'}`}
              >
                {isListening ? `録音中... ${timeLeftWeb}s` : "自作評価を開始"}
              </button>

              {webSpeechResult && !isListening && (
                <div className="p-4 bg-white rounded border text-center shadow-sm">
                  <div className="text-[10px] font-bold text-gray-500">スコア</div>
                  <div className="text-3xl font-black text-slate-800">{(webSpeechResult.score * 100).toFixed(0)}</div>
                  <p className="text-[10px] text-gray-500 mt-2 leading-tight">{webSpeechResult.summary}</p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}