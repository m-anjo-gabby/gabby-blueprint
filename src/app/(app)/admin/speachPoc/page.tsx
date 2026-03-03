"use client";

import { useState, useMemo } from "react";
import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";
import { useAzureSpeech } from "@/hooks/useAzureSpeech";
import { useVoice } from "@/hooks/useVoice";

const samplePhrases = [
  "We start fermenting the soy.",
  "We start fermenting the soy milk with a specific starter culture.",
  "We monitor the pH level while fermenting the mixture."
];

const voiceOptions = [
  { id: "en-US-JennyNeural", name: "Jenny (米国・女性)", desc: "明るく標準的" },
  { id: "en-US-GuyNeural", name: "Guy (米国・男性)", desc: "落ち着いた信頼感" },
  { id: "en-GB-SoniaNeural", name: "Sonia (英国・女性)", desc: "知的な英国アクセント" },
  { id: "en-GB-RyanNeural", name: "Ryan (英国・男性)", desc: "フォーマルな英国風" },
  { id: "en-CA-ClaraNeural", name: "Clara (カナダ・女性)", desc: "親しみやすい" },
  { id: "en-CA-LiamNeural", name: "Liam (カナダ・男性)", desc: "力強い" },
  { id: "en-AU-NatashaNeural", name: "Natasha (豪・女性)", desc: "活発なオーストラリア風" },
  { id: "en-AU-WilliamNeural", name: "William (豪・男性)", desc: "柔らかいオーストラリア風" },
];

export default function SpeechPoCPage() {
  const [selectedPreset, setSelectedPreset] = useState(samplePhrases[0]);
  const [ttsText, setTtsText] = useState(samplePhrases[0]);
  const [evalText, setEvalText] = useState(samplePhrases[0]);

  const [voice, setVoice] = useState(voiceOptions[0].id);
  const [style, setStyle] = useState("general");
  const [rate, setRate] = useState(1.0);
  const [pitch, setPitch] = useState(0);
  const [granularity, setGranularity] = useState(SpeechSDK.PronunciationAssessmentGranularity.Phoneme);

  const { speak: speakAzure, startAssessment, resetResult, isSpeaking: isAzureSpeaking, isRecording, result, rawResult, recordedAudioUrl } = useAzureSpeech();
  const { speak: speakWebSpeech, startEvaluation, resetFeedback, stopListening, isSpeaking: isWebSpeaking, isListening, feedback, timeLeft } = useVoice();

  const assessmentData = useMemo(() => {
    if (!rawResult) return null;
    const jsonString = rawResult.properties.getProperty(SpeechSDK.PropertyId.SpeechServiceResponse_JsonResult);
    if (!jsonString) return null;
    try {
      const parsed = JSON.parse(jsonString) as { NBest: { Words: AssessmentWord[] }[] };
      return parsed?.NBest?.[0] ? { Words: parsed.NBest[0].Words } : null;
    } catch { return null; }
  }, [rawResult]);

  const handlePresetChange = (val: string) => {
    setSelectedPreset(val);
    setTtsText(val);
    setEvalText(val);
  };

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold">Azure Speech 検証ツール</h1>

      {/* 1. 共通テキスト設定 */}
      <section className="space-y-4">
        <h2 className="font-bold text-lg">1. テキスト設定 (読み上げ／発音評価共通)</h2>
        <div className="border p-6 rounded-xl bg-gray-50 space-y-4">
          <div>
            <p className="font-medium mb-2">プリセットから選択</p>
            <select value={selectedPreset} onChange={(e) => handlePresetChange(e.target.value)} className="w-full p-2 border rounded">
              {samplePhrases.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <p className="font-medium mb-2">対象テキスト（編集可能）</p>
            <textarea value={ttsText} onChange={(e) => { setTtsText(e.target.value); setEvalText(e.target.value); }} className="w-full p-2 border rounded h-24" />
          </div>
        </div>
      </section>

      {/* 読み上げセクション (左右分割) */}
      <section className="space-y-4">
        <h2 className="font-bold text-lg">2. 読み上げ (TTS) 比較</h2>
        <div className="grid grid-cols-2 gap-6">
          <div className="border p-4 rounded-xl bg-blue-50/50 space-y-3">
            <h3 className="font-bold text-blue-900">Azure TTS (高機能)</h3>
            <select value={voice} onChange={(e) => setVoice(e.target.value)} className="w-full p-2 border rounded text-sm">{voiceOptions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
            <select value={style} onChange={(e) => setStyle(e.target.value)} className="w-full p-2 border rounded text-sm">
              <option value="general">Standard (標準)</option>
              <option value="cheerful">Cheerful (陽気)</option>
              <option value="whispering">Whispering (ささやき)</option>
              <option value="newscast">Newscast (ニュース)</option>
            </select>
            <div className="flex gap-2">
              <input type="number" value={rate} onChange={(e) => setRate(Number(e.target.value))} step="0.1" className="w-full border p-1" placeholder="速度" />
              <input type="number" value={pitch} onChange={(e) => setPitch(Number(e.target.value))} step="5" className="w-full border p-1" placeholder="ピッチ" />
            </div>
            <button onClick={() => speakAzure(ttsText, voice, style, rate, pitch)} disabled={isAzureSpeaking || isRecording} className="w-full bg-blue-600 text-white py-2 rounded">
              {isAzureSpeaking ? "再生中..." : "Azureで再生"}
            </button>
          </div>

          <div className="border p-4 rounded-xl bg-gray-100 space-y-3">
            <h3 className="font-bold text-gray-700">Web Speech (標準)</h3>
            <p className="text-xs text-gray-500 h-[100px]">ブラウザ標準機能を利用するため、速度・ピッチ等の細かい設定はできません。</p>
            <button onClick={() => speakWebSpeech(ttsText)} disabled={isWebSpeaking} className="w-full bg-gray-600 text-white py-2 rounded">
              {isWebSpeaking ? "再生中..." : "ブラウザで再生"}
            </button>
          </div>
        </div>
      </section>

      {/* 3. 発音評価 聴き比べ */}
      <section className="space-y-6">
        <h2 className="font-bold text-lg">3. 発音評価 聴き比べ</h2>
        
        {/* 共通のテキストエリア */}
        <div className="border p-6 rounded-xl bg-white shadow-sm space-y-4">
          <label className="font-bold block">評価対象テキスト</label>
          <textarea 
            value={evalText} 
            onChange={(e) => setEvalText(e.target.value)} 
            className="w-full p-2 border rounded h-24" 
          />
          <button 
            onClick={() => {
              resetResult();   // Azure側をリセット
              resetFeedback(); // WebSpeech側をリセット
            }}
            className="text-sm text-gray-500 hover:text-red-600 underline"
          >
            評価結果をクリア
          </button>
        </div>

        {/* --- Web Speech セクション --- */}
        <div className="border p-6 rounded-xl bg-gray-100 space-y-4">
          <h3 className="font-bold text-gray-700">Web Speech (テキスト照合)</h3>
          <button 
            onClick={() => {
              if (isListening) stopListening();
              else startEvaluation(evalText, [], (res) => {});
            }} 
            className={`w-full text-white py-2 rounded font-bold transition-all ${
              isListening ? 'bg-red-600 animate-pulse' : 'bg-gray-600 hover:bg-gray-700'
            }`}
          >
            {isListening 
              ? `録音中... 残り ${timeLeft} 秒 (停止)` 
              : "テキスト認識を開始 (7秒)"
            }
          </button>

          {feedback && (
            <div className="p-4 bg-white rounded border text-center">
              <div className="text-sm font-bold text-gray-600">テキスト一致度</div>
              <div className="text-3xl font-black">{(feedback.score * 100).toFixed(0)}%</div>
            </div>
          )}
        </div>

        {/* --- Azure セクション --- */}
        <div className="border p-6 rounded-xl bg-green-50/50 space-y-4">
          <h3 className="font-bold text-green-900">Azure Assessment (詳細解析)</h3>
          <button 
            onClick={() => startAssessment(evalText, granularity)} 
            disabled={isRecording || isAzureSpeaking}
            className="w-full bg-green-600 text-white py-2 rounded font-bold hover:bg-green-700"
          >
            {isRecording ? "評価中..." : "Azure評価を開始 (7秒)"}
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

              {/* JSONデータ表示 */}
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
      </section>
    </div>
  );
}