// Yahoo!乗換案内の「検索結果を共有」テキスト（LINE等でよく貼られる形式）を解析する。
// 例:
//   大阪 ⇒ 森ノ宮
//   2026年9月26日(土)
//   10:18 ⇒ 10:30
//   ------------------------------
//   所要時間 12分
//   運賃[IC優先] 180円
//   乗換 0回
//   距離 5.9 km
//   ------------------------------
//   ■大阪
//   ↓ 10:18〜10:30
//   ↓ ＪＲ大阪環状線 京橋・鶴橋方面
//   ↓ 2番線発 → 2番線着
//   ■森ノ宮
// 公式の固定テンプレートではないため、各項目は「見つかれば埋める」方式にする
// （どれか1つでも見つかればnullを返さず、部分的な結果を返す）。

export interface ParsedRouteInfo {
  fromName: string | null;
  toName: string | null;
  date: string | null; // "YYYY-MM-DD"
  departureTime: string | null; // "HH:mm"
  arrivalTime: string | null; // "HH:mm"
  durationMinutes: number | null;
  fareYen: number | null;
  transferCount: number | null;
  distanceMeters: number | null;
  lineNames: string[];
}

function toHalfWidth(s: string): string {
  return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

export function parseTransitShareText(text: string): ParsedRouteInfo {
  const result: ParsedRouteInfo = {
    fromName: null,
    toName: null,
    date: null,
    departureTime: null,
    arrivalTime: null,
    durationMinutes: null,
    fareYen: null,
    transferCount: null,
    distanceMeters: null,
    lineNames: [],
  };

  const lines = text
    .split(/\r?\n/)
    .map((l) => toHalfWidth(l.trim()))
    .filter((l) => l.length > 0);

  for (const line of lines) {
    const timeRangeMatch = line.match(/^(\d{1,2}:\d{2})\s*[⇒→]\s*(\d{1,2}:\d{2})/);
    if (timeRangeMatch && !result.departureTime) {
      result.departureTime = timeRangeMatch[1];
      result.arrivalTime = timeRangeMatch[2];
      continue;
    }

    const stationPairMatch = line.match(/^(.+?)\s*[⇒→]\s*(.+)$/);
    if (stationPairMatch && !result.fromName && !/^\d{1,2}:\d{2}$/.test(stationPairMatch[1])) {
      result.fromName = stationPairMatch[1].trim();
      result.toName = stationPairMatch[2].trim();
      continue;
    }

    const dateMatch = line.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (dateMatch && !result.date) {
      const [, y, m, d] = dateMatch;
      result.date = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      continue;
    }

    const durationMatch = line.match(/所要時間\s*(\d+)\s*分/);
    if (durationMatch) {
      result.durationMinutes = Number(durationMatch[1]);
      continue;
    }

    const fareMatch = line.match(/運賃.*?(\d+)\s*円/);
    if (fareMatch && result.fareYen == null) {
      result.fareYen = Number(fareMatch[1]);
      continue;
    }

    const transferMatch = line.match(/乗換\s*(\d+)\s*回/);
    if (transferMatch) {
      result.transferCount = Number(transferMatch[1]);
      continue;
    }

    const distanceMatch = line.match(/距離\s*([\d.]+)\s*km/);
    if (distanceMatch) {
      result.distanceMeters = Math.round(Number(distanceMatch[1]) * 1000);
      continue;
    }

    // 路線名の行: "↓ ＪＲ大阪環状線 京橋・鶴橋方面" のように「線」を含む場合が多い。
    // "↓ 2番線発 → 2番線着" のようなホーム番線の行は除外する。
    const lineNameMatch = line.match(/^↓\s*(\S*線\S*|\S*新幹線\S*)(?:\s+(.*))?$/);
    if (lineNameMatch && !/^\d+番線/.test(lineNameMatch[1]) && !line.includes("番線")) {
      result.lineNames.push(lineNameMatch[1]);
      continue;
    }
  }

  return result;
}

export function hasAnyParsedData(info: ParsedRouteInfo): boolean {
  return (
    info.fromName != null ||
    info.toName != null ||
    info.durationMinutes != null ||
    info.fareYen != null ||
    info.distanceMeters != null ||
    info.lineNames.length > 0
  );
}
