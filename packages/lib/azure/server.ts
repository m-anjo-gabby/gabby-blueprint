/**
 * サーバーサイド専用: Azure Speech Tokenを取得する共通関数
 */
export async function getAzureSpeechToken() {
  const region = process.env.AZURE_SPEECH_REGION;
  const key = process.env.AZURE_SPEECH_SERVICE_KEY;

  // リージョンが未設定の場合、デフォルトに頼らずエラーを出す方が安全です
  if (!region || !key) {
    throw new Error('Azure configuration (REGION or KEY) is missing.');
  }

  const response = await fetch(
    `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
    {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      // キャッシュ戦略は必要に応じて調整（トークンは10分有効）
      cache: 'no-store', 
    }
  );

  if (!response.ok) {
    // statusTextだけでなく、可能であればボディの中身も取得して詳細を確認する
    const errorBody = await response.text().catch(() => 'No detail');
    throw new Error(`Azure Token Error: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  return response.text();
}