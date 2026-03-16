"use client";

import { useState, useMemo } from "react";
import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";
import { useAzureSpeechTest } from "@/hooks/useAzureSpeechTest";
import { useVoice } from "@/hooks/useVoice";

const samplePhrases = [
  "We start fermenting the soy.",
  "We start fermenting the soy milk with a specific starter culture.",
  "We limit sucrose intake.",
  "We optionally add vitamins.",
  "We create a stable emulsion."
];

const voiceOptions = [
  // 🇺🇸 United States
  { id: "en-US-JennyNeural", name: "Jenny (米国・女性)", desc: "明るく万能・最人気" },
  { id: "en-US-AriaNeural", name: "Aria (米国・女性)", desc: "自然で柔らかい" },
  { id: "en-US-SaraNeural", name: "Sara (米国・女性)", desc: "ナチュラルで聞きやすい" },
  { id: "en-US-GuyNeural", name: "Guy (米国・男性)", desc: "落ち着いた信頼感" },
  { id: "en-US-DavisNeural", name: "Davis (米国・男性)", desc: "若く軽快" },
  { id: "en-US-TonyNeural", name: "Tony (米国・男性)", desc: "ニュース向き" },

  // 🇬🇧 United Kingdom
  { id: "en-GB-SoniaNeural", name: "Sonia (英国・女性)", desc: "知的な英国アクセント" },
  { id: "en-GB-LibbyNeural", name: "Libby (英国・女性)", desc: "現代的で自然" },
  { id: "en-GB-RyanNeural", name: "Ryan (英国・男性)", desc: "フォーマル英国風" },
  { id: "en-GB-ThomasNeural", name: "Thomas (英国・男性)", desc: "重厚で落ち着き" },

  // 🇨🇦 Canada
  { id: "en-CA-ClaraNeural", name: "Clara (カナダ・女性)", desc: "親しみやすい" },
  { id: "en-CA-LiamNeural", name: "Liam (カナダ・男性)", desc: "力強い" },

  // 🇦🇺 Australia
  { id: "en-AU-NatashaNeural", name: "Natasha (豪・女性)", desc: "活発な豪州風" },
  { id: "en-AU-FreyaNeural", name: "Freya (豪・女性)", desc: "明るく自然" },
  { id: "en-AU-WilliamNeural", name: "William (豪・男性)", desc: "柔らかい豪州風" },

  // 🇮🇳 India
  { id: "en-IN-NeerjaNeural", name: "Neerja (インド・女性)", desc: "明瞭なインド英語" },
  { id: "en-IN-PrabhatNeural", name: "Prabhat (インド・男性)", desc: "力強いインド英語" },

  // 🇮🇪 Ireland
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

  const { speak: speakAzure, startAssessment, stopAssessment, resetResult, isSpeaking: isAzureSpeaking, isRecording, result, rawResult, timeLeft: timeLeftAzure, recordedAudioUrl } = useAzureSpeechTest();
  const { speak: speakWebSpeech, startEvaluation, resetFeedback, stopListening, isSpeaking: isWebSpeaking, isListening, feedback, timeLeft: timeLeftWeb } = useVoice();

  const assessmentData = useMemo(() => {
    if (!rawResult) return null;
    const jsonString = rawResult.properties.getProperty(SpeechSDK.PropertyId.SpeechServiceResponse_JsonResult);
    if (!jsonString) return null;
    try {
      const parsed = JSON.parse(jsonString) as { NBest: { Words: AssessmentWord[] }[] };
      return parsed?.NBest?.[0] ? { Words: parsed.NBest[0].Words } : null;
    } catch { return null; }
  }, [rawResult]);

  // 読み上げ用のプリセット変更
  const handleTtsPresetChange = (val: string) => {
    setTtsText(val);
  };
  // 発音評価用のプリセット変更
  const handleEvalPresetChange = (val: string) => {
    setEvalText(val);
  };

  return (
    <div className="p-8 mx-auto max-w-6xl space-y-8">
      <h1 className="text-2xl font-bold">Azure / WebSpeech 検証ツール</h1>

      {/* タブ切り替えスイッチ */}
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

      {/* タブコンテンツ */}
      {activeTab === 'tts' ? (
        // 読み上げセクション (左右分割)
        <section className="space-y-4 max-w-3xl">
          <h2 className="font-bold text-lg">・読み上げ (TTS)の比較</h2>
          {/* 読み上げ設定エリア */}
          <div className="border p-6 rounded-xl bg-gray-50 space-y-4">
            <h3 className="font-bold text-gray-700">テキスト設定</h3>
            <label className="text-[10px] font-bold text-blue-800 uppercase">プリセットから選択</label>
            <select value={ttsText} onChange={(e) => handleTtsPresetChange(e.target.value)} className="w-full p-2 border rounded">
              {samplePhrases.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <label className="text-[10px] font-bold text-blue-800 uppercase">対象テキスト（編集可能）</label>
            <textarea value={ttsText} onChange={(e) => setTtsText(e.target.value)} className="w-full p-2 border rounded h-24" />
          </div>

          <div className="grid grid-cols-10 gap-6">
            {/* Azure TTS パネル */}
            <div className="col-span-7 border p-4 rounded-xl bg-blue-50/50 space-y-3">
              <h3 className="font-bold text-blue-900">Azure TTS (高機能)</h3>
              
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-blue-800 uppercase">音声モデル (抜粋)</label>
                <select value={voice} onChange={(e) => setVoice(e.target.value)} className="w-full p-2 border rounded text-sm">
                  {voiceOptions.map(v => <option key={v.id} value={v.id}>{v.name} / {v.desc}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-blue-800 uppercase">スタイル (音声モデル依存)</label>
                <select
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                  className="w-full p-2 border rounded text-sm"
                >
                  {styleOptions.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-blue-800 uppercase">
                    速度 (0.5 - 2.0)
                  </label>
                  <input 
                    type="number" 
                    value={rate} 
                    min="0.5" 
                    max="2.0" 
                    step="0.1" 
                    onChange={(e) => setRate(Number(e.target.value))} 
                    className="w-full border p-1 rounded text-sm" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-blue-800 uppercase">
                    ピッチ (-50 - 50)
                  </label>
                  <input 
                    type="number" 
                    value={pitch} 
                    min="-50" 
                    max="50" 
                    step="5" 
                    onChange={(e) => setPitch(Number(e.target.value))} 
                    className="w-full border p-1 rounded text-sm" 
                  />
                </div>
              </div>

              <button onClick={() => speakAzure(ttsText, voice, style, rate, pitch)} disabled={isAzureSpeaking || isRecording} className="w-full bg-blue-600 text-white py-2 rounded font-bold hover:bg-blue-700 transition">
                {isAzureSpeaking ? "再生中..." : "Azureで再生"}
              </button>
            </div>

            {/* Web Speech TTS パネル */}
            <div className="col-span-3 border p-4 rounded-xl bg-gray-100 space-y-3">
              <h3 className="font-bold text-gray-700">Web Speech (標準)</h3>
              <p className="text-xs text-gray-500 h-25">ブラウザ標準機能を利用するため、速度・ピッチ等の細かい設定はできません。</p>
              <button onClick={() => speakWebSpeech(ttsText)} disabled={isWebSpeaking} className="w-full bg-gray-600 text-white py-2 rounded">
                {isWebSpeaking ? "再生中..." : "ブラウザで再生"}
              </button>
            </div>
          </div>
        </section>
      ) : (
        // 3. 発音評価 聴き比べ
        <section className="space-y-6">
          <h2 className="font-bold text-lg">・発音評価の比較</h2>

          {/* 評価設定エリア */}
          <div className="border p-6 rounded-xl bg-gray-50 space-y-4">
            <h3 className="font-bold text-gray-700">テキスト設定</h3>
            <label className="text-[10px] font-bold text-blue-800 uppercase">プリセットから選択</label>
            <select value={evalText} onChange={(e) => handleEvalPresetChange(e.target.value)} className="w-full p-2 border rounded">
              {samplePhrases.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <label className="text-[10px] font-bold text-blue-800 uppercase">対象テキスト（編集可能）</label>
            <textarea value={evalText} onChange={(e) => setEvalText(e.target.value)} className="w-full p-2 border rounded h-24" />
            <button onClick={() => { resetResult(); resetFeedback(); }} className="text-sm text-gray-500 hover:text-red-600 underline">結果をクリア</button>
          </div>

          <div className="grid grid-cols-10 gap-6">
            {/* --- Azure セクション (7/10) --- */}
            <div className="col-span-7 border p-6 rounded-xl bg-green-50/50 space-y-4">
              <h3 className="font-bold text-green-900">Azure Assessment (詳細解析)</h3>
              <button 
                onClick={() => {
                  if (isRecording) {
                    // 録音中なら停止
                    stopAssessment();
                  } else {
                    // 評価開始時は明示的に粒度を渡す
                    const selectedGranularity = SpeechSDK.PronunciationAssessmentGranularity.Phoneme;
                    setGranularity(selectedGranularity);
                    startAssessment(evalText, granularity);
                  }
                }}
                disabled={isAzureSpeaking}
                className={`w-full py-2 rounded font-bold transition-colors ${
                  isRecording 
                    ? "bg-red-600 hover:bg-red-700 text-white" 
                    : "bg-green-600 hover:bg-green-700 text-white"
                }`}
              >
                {isRecording 
                  ? `評価中... (${timeLeftAzure}秒)` 
                  : "Azure評価を開始 (7秒)"}
              </button>

              {recordedAudioUrl && (
                <div className="p-3 bg-white border rounded">
                  <audio controls src={recordedAudioUrl} className="w-full" />
                </div>
              )}

              {result && (
                <div className="space-y-4 pt-2 border-t border-green-200">
                  <div className="bg-white p-4 rounded-lg text-center border">
                    <div className="text-sm font-bold text-green-800">総合スコア</div>
                    <div className="text-4xl font-black text-green-800">{result.pronunciationScore?.toFixed(1) ?? '0'}</div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 bg-white rounded border"><div>正確性</div><div className="font-bold text-lg">{result.completenessScore?.toFixed(1)}</div></div>
                    <div className="p-2 bg-white rounded border"><div>流暢さ</div><div className="font-bold text-lg">{result.fluencyScore?.toFixed(1)}</div></div>
                    <div className="p-2 bg-white rounded border"><div>発音</div><div className="font-bold text-lg">{result.accuracyScore?.toFixed(1)}</div></div>
                  </div>

                  {assessmentData && (
                    <div className="border-t pt-4">
                      <h4 className="font-bold text-gray-700 mb-2">単語別診断詳細</h4>
                      <div className="text-xs text-gray-500 mb-4">
                          音素情報のデフォルトはSAPI、発音矯正向けにIPA(国際音声記号)を指定
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        {assessmentData.Words.map((w, i) => (
                          <div key={i} className={`p-3 border rounded text-sm ${w.PronunciationAssessment.ErrorType !== "None" ? "bg-red-50 border-red-200" : "bg-gray-50"}`}>
                            <div className="font-bold">{w.Word}</div>
                            {w.Phonemes?.filter(p => p.PronunciationAssessment.AccuracyScore < 50).map((p, idx) => (
                              <div key={idx} className="text-[10px] text-red-500">・{p.Phoneme} ({p.PronunciationAssessment.AccuracyScore})</div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-4 relative">
                    <div className="flex justify-between items-center mb-1">
                      <div className="text-xs text-gray-500 font-bold">評価詳細データ (JSON):</div>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(JSON.stringify(result, null, 2));
                          alert("クリップボードにコピーしました");
                        }}
                        className="text-[10px] bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded transition"
                      >
                        コピー
                      </button>
                    </div>
                    <pre className="bg-black text-green-400 p-4 rounded overflow-auto h-48 text-[10px]">
                      {JSON.stringify(result, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>

            {/* --- Web Speech セクション (3/10) --- */}
            <div className="col-span-3 border p-6 rounded-xl bg-gray-100 space-y-4">
              <h3 className="font-bold text-gray-700">Web Speech (自作評価)</h3>
              <button 
                onClick={() => {
                  if (isListening) stopListening();
                  else startEvaluation(evalText, [], () => {});
                }} 
                className={`w-full text-white py-2 rounded font-bold transition-all ${
                  isListening ? 'bg-red-600 animate-pulse' : 'bg-gray-600 hover:bg-gray-700'
                }`}
              >
                {isListening ? `録音中... 残り ${timeLeftWeb} 秒 (停止)` : "自作評価を開始 (7秒)"}
              </button>

              {feedback && !isListening && (
                <div className="p-4 bg-white rounded border border-gray-200 text-center shadow-sm animate-in fade-in duration-500">
                  <div className="text-sm font-bold text-gray-600">総合スコア</div>
                  <div className="text-4xl font-black text-gray-800 mt-1">
                    {(feedback.score * 100).toFixed(0)}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">{feedback.summary}</p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}