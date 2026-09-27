// Gemini API(乗換案内スクリーンショットの読み取り)の中継。
// APIキーはサーバーの環境変数 GEMINI_API_KEY から付与し、ブラウザには一切渡さない。
// 任意の質問に使われないよう、プロンプトはサーバー側で固定し、ブラウザからは画像だけを受け取る。

const MODEL = "gemini-3.6-flash";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

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

// Vercel Functionsのリクエスト上限(4.5MB)に収まるよう、base64で約4MBまでに制限する。
const MAX_IMAGE_BASE64_LENGTH = 4_000_000;

// 他サイトのページからこの中継を呼ばれないよう、同じオリジンからのリクエストだけ受け付ける。
function isSameOrigin(request: Request): boolean {
  const source = request.headers.get("origin") ?? request.headers.get("referer");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!source || !host) return false;
  try {
    return new URL(source).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Gemini APIキーがサーバーに設定されていません。" }, { status: 503 });
  }
  if (!isSameOrigin(request)) {
    return Response.json({ error: "許可されていないアクセス元です。" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { mimeType?: unknown; data?: unknown } | null;
  const mimeType = body?.mimeType;
  const data = body?.data;
  if (typeof mimeType !== "string" || !mimeType.startsWith("image/") || typeof data !== "string" || !data) {
    return Response.json({ error: "画像データが不正です。" }, { status: 400 });
  }
  if (data.length > MAX_IMAGE_BASE64_LENGTH) {
    return Response.json({ error: "画像が大きすぎます。" }, { status: 413 });
  }

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
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
    const detail = await res.text().catch(() => "");
    return Response.json({ error: `Gemini API エラー (${res.status}): ${detail}` }, { status: 502 });
  }

  const responseData = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text =
    responseData.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("") ?? "";
  return Response.json({ text });
}
