// Nominatim (OpenStreetMap) をブラウザから直接利用する場所検索クライアント。
// APIキー不要・無料。ただし利用ポリシー上、キー入力ごとのオートコンプリートは禁止されており、
// 1秒1リクエストが上限のため、必ずボタン押下など人間の明示的な操作からのみ呼び出すこと。
// カスタムUser-Agentはブラウザのfetchから設定できないため、識別はブラウザが自動送信する
// Refererヘッダーに委ねる(emailパラメータは静的サイトに埋め込むと公開されてしまうため付けない)。

export class GeocodingError extends Error {}

export interface PlaceResult {
  name: string;
  lat: number;
  lng: number;
  osmId: string | null;
}

interface NominatimResult {
  display_name?: string;
  lat?: string;
  lon?: string;
  place_id?: number;
}

export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  const params = new URLSearchParams({
    format: "jsonv2",
    q: query,
    limit: "5",
    "accept-language": "ja",
  });

  let res: Response;
  try {
    res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
  } catch {
    throw new GeocodingError("検索に失敗しました。手動で入力してください。");
  }
  if (!res.ok) {
    throw new GeocodingError("検索に失敗しました。手動で入力してください。");
  }

  try {
    const data: NominatimResult[] = await res.json();
    return data
      .filter((item) => item.lat != null && item.lon != null)
      .map((item) => ({
        name: item.display_name ?? query,
        lat: Number(item.lat),
        lng: Number(item.lon),
        osmId: item.place_id != null ? String(item.place_id) : null,
      }));
  } catch {
    throw new GeocodingError("検索結果の解析に失敗しました。手動で入力してください。");
  }
}
