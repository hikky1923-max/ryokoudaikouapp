// ブラウザに渡してよい設定だけを返す。
// Maps JavaScript API(地図・場所検索)はブラウザからキー付きで読み込む仕組みのため、
// Google Mapsのキーだけはブラウザに渡る。Google Cloud ConsoleでHTTPリファラー制限をかけて保護すること。
// Geminiのキーはここでは返さず、/api/gemini の中だけで使う。
export function GET(): Response {
  return Response.json(
    {
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || null,
      geminiAvailable: Boolean(process.env.GEMINI_API_KEY),
    },
    { headers: { "cache-control": "no-store" } }
  );
}
