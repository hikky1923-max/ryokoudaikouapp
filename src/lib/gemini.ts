// Gemini API (Google AI) をブラウザから直接呼び出すクライアント。
// 乗換案内アプリ(Yahoo!乗換案内・Google Mapsなど)のスクリーンショットを渡すと、
// 経路情報を構造化データとして読み取る。APIキーは設定画面で入力し、
// localStorageに保存されたものを利用する(バックエンド不要)。

const MODEL = "gemini-3.6-flash";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export class GeminiApiError extends Error {}

export interface ExtractedSegment {
  fromName: string;
  toName: string;
  lineName: string | null;
  headsign: string | null;
  departurePlatform: string | null;
  arrivalPlatform: string | null;
  departureTime: string | null; // "HH:mm"
  arrivalTime: string | null; // "HH:mm"
}

export interface ExtractedRouteInfo {
  date: string | null; // "YYYY-MM-DD"
  durationMinutes: number | null;
  fareYen: number | null;
  distanceMeters: number | null;
  segments: ExtractedSegment[];
}

const EXTRACTION_PROMPT = `この画像は、Yahoo!乗換案内やGoogle Mapsなどの乗換案内アプリの経路検索結果のスクリーンショットです。
画像から経路情報を読み取り、以下のJSON形式でのみ出力してください(説明文は不要、JSONのみ)。

{
  "date": "YYYY-MM-DD形式の日付、読み取れなければnull",
  "durationMinutes": 全体の所要時間(分)、読み取れなければnull,
  "fareYen": 全体の運賃(円)、読み取れなければnull,
  "distanceMeters": 距離(メートル)、読み取れなければnull,
  "segments": [
    {
      "fromName": "この区間の出発駅・停留所名(「駅」等の表記が省略されていれば補って構いません)",
      "toName": "この区間の到着駅・停留所名",
      "lineName": "路線名・列車名(例: JR京都線、のぞみ352号)、無ければnull",
      "headsign": "行き先・方面表示(例: 高槻行、東京行)、無ければnull",
      "departurePlatform": "出発ホーム番線(数字のみ)、無ければnull",
      "arrivalPlatform": "到着ホーム番線(数字のみ)、無ければnull",
      "departureTime": "この区間の出発時刻(HH:mm)、無ければnull",
      "arrivalTime": "この区間の到着時刻(HH:mm)、無ければnull"
    }
  ]
}

乗換がある場合は、乗換駅ごとに区切って segments に複数の要素を入れてください(乗換駅は前の区間のtoNameと次の区間のfromNameが一致します)。
徒歩区間は lineName を "徒歩" としてください。`;

function fileToBase64(file: Blob): Promise<{ data: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [header, data] = result.split(",");
      const mimeType = header.match(/data:(.*);base64/)?.[1] ?? "image/png";
      resolve({ data, mimeType });
    };
    reader.onerror = () => reject(new GeminiApiError("画像の読み込みに失敗しました。"));
    reader.readAsDataURL(file);
  });
}

function extractJson<T>(text: string): T {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new GeminiApiError("AIの応答からJSONを抽出できませんでした。");
  return JSON.parse(match[0]) as T;
}

export async function extractRouteFromImage(
  apiKey: string,
  imageFile: Blob
): Promise<ExtractedRouteInfo> {
  if (!apiKey) {
    throw new GeminiApiError("Gemini APIキーが設定されていません。設定画面から登録してください。");
  }
  const { data, mimeType } = await fileToBase64(imageFile);

  const res = await fetch(`${API_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: EXTRACTION_PROMPT }, { inline_data: { mime_type: mimeType, data } }],
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GeminiApiError(`Gemini API エラー (${res.status}): ${text}`);
  }

  const responseData = await res.json();
  const text: string =
    responseData.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? "")
      .join("") ?? "";

  const parsed = extractJson<Partial<ExtractedRouteInfo>>(text);
  return {
    date: parsed.date ?? null,
    durationMinutes: parsed.durationMinutes ?? null,
    fareYen: parsed.fareYen ?? null,
    distanceMeters: parsed.distanceMeters ?? null,
    segments: Array.isArray(parsed.segments) ? parsed.segments : [],
  };
}
