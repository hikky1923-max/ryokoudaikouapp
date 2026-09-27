// 乗換案内アプリ(Yahoo!乗換案内・Google Mapsなど)のスクリーンショットを渡すと、
// 経路情報を構造化データとして読み取る。Gemini APIの呼び出しはサーバー(/api/gemini)が中継し、
// APIキーはサーバーの環境変数にだけ置く(ブラウザには渡さない)。

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

// 大きな写真でもサーバーの受信上限に収まるよう、長辺をこのサイズまで縮小してJPEGにする。
const MAX_IMAGE_SIDE = 2000;

async function imageToBase64(file: Blob): Promise<{ data: string; mimeType: string }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new GeminiApiError("画像の読み込みに失敗しました。");
  }
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  return { data: dataUrl.slice(dataUrl.indexOf(",") + 1), mimeType: "image/jpeg" };
}

function extractJson<T>(text: string): T {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new GeminiApiError("AIの応答からJSONを抽出できませんでした。");
  return JSON.parse(match[0]) as T;
}

export async function extractRouteFromImage(imageFile: Blob): Promise<ExtractedRouteInfo> {
  const { data, mimeType } = await imageToBase64(imageFile);

  const res = await fetch("/api/gemini", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mimeType, data }),
  });
  const body = (await res.json().catch(() => null)) as { text?: string; error?: string } | null;
  if (!res.ok) {
    throw new GeminiApiError(body?.error ?? `画像の読み取りに失敗しました (${res.status})`);
  }
  const text = body?.text ?? "";

  const parsed = extractJson<Partial<ExtractedRouteInfo>>(text);
  return {
    date: parsed.date ?? null,
    durationMinutes: parsed.durationMinutes ?? null,
    fareYen: parsed.fareYen ?? null,
    distanceMeters: parsed.distanceMeters ?? null,
    segments: Array.isArray(parsed.segments) ? parsed.segments : [],
  };
}
