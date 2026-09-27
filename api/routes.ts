// Routes API(経路計算)の中継。APIキーはサーバーの環境変数 GOOGLE_MAPS_API_KEY から付与する。

const ROUTES_API_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

// 返す項目はサーバー側で固定し、任意のフィールド取得に使われないようにする。
const ROUTES_API_FIELD_MASK = [
  "routes.duration",
  "routes.distanceMeters",
  "routes.legs.steps.travelMode",
  "routes.legs.steps.transitDetails",
].join(",");

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
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return Response.json({ error: { status: "NOT_CONFIGURED" } }, { status: 503 });
  }
  if (!isSameOrigin(request)) {
    return Response.json({ error: { status: "FORBIDDEN_ORIGIN" } }, { status: 403 });
  }

  // キーにHTTPリファラー制限をかけていても通るよう、アプリのページURLをリファラーとして付ける。
  const referer = request.headers.get("referer") ?? request.headers.get("origin");
  const res = await fetch(ROUTES_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": ROUTES_API_FIELD_MASK,
      ...(referer ? { Referer: referer } : {}),
    },
    body: await request.text(),
  });

  return new Response(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
