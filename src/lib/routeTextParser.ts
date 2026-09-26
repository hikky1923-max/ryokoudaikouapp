// Yahoo!乗換案内の「検索結果を共有」テキスト（LINE等でよく貼られる形式）を解析する。
// 単純な1区間の例:
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
// 乗換を含む場合は "■駅名 ↓... ↓... ↓..." のブロックが乗換駅を挟んで繰り返される
// (例: ■大阪 ↓... ■新大阪 ↓... ■名古屋)。
// 公式の固定テンプレートではないため、各項目は「見つかれば埋める」方式にする
// （どれか1つでも見つかればnullを返さず、部分的な結果を返す）。

export interface ParsedSegment {
  fromName: string;
  toName: string;
  lineName: string | null;
  headsign: string | null; // 方面・行き先
  departurePlatform: string | null;
  arrivalPlatform: string | null;
  departureTime: string | null; // "HH:mm"(この区間内)
  arrivalTime: string | null;
  durationMinutes: number | null; // departureTime/arrivalTimeから算出
  fareYen: number | null; // 「運賃内訳」セクションから区間名が一致すれば埋まる
}

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
  segments: ParsedSegment[]; // 経路上の各区間(乗換駅を含む全区間)。単純な1区間なら要素数1
}

function toHalfWidth(s: string): string {
  return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

export function diffMinutes(from: string, to: string): number | null {
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  if ([fh, fm, th, tm].some((n) => Number.isNaN(n))) return null;
  let diff = th * 60 + tm - (fh * 60 + fm);
  if (diff < 0) diff += 24 * 60; // 日をまたぐ場合
  return diff;
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
    segments: [],
  };

  const allLines = text
    .split(/\r?\n/)
    .map((l) => toHalfWidth(l.trim()))
    .filter((l) => l.length > 0);

  const bodyStart = allLines.findIndex((l) => l.startsWith("■"));
  const headerLines = bodyStart === -1 ? allLines : allLines.slice(0, bodyStart);
  const bodyLines = bodyStart === -1 ? [] : allLines.slice(bodyStart);

  // ---- ヘッダー部分(全体のサマリー) ----
  for (const line of headerLines) {
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

    // 「所要時間 12分」「所要時間 2時間49分」の両方に対応する。
    const durationMatch = line.match(/所要時間\s*(?:(\d+)\s*時間)?\s*(?:(\d+)\s*分)?/);
    if (durationMatch && (durationMatch[1] || durationMatch[2])) {
      const hours = durationMatch[1] ? Number(durationMatch[1]) : 0;
      const minutes = durationMatch[2] ? Number(durationMatch[2]) : 0;
      result.durationMinutes = hours * 60 + minutes;
      continue;
    }

    // 「運賃[IC優先] 13,870円」のようにカンマ区切りの場合があるため、
    // 数字部分はカンマを含めて拾ってから除去する。
    const fareMatch = line.match(/運賃.*?([\d,]+)\s*円/);
    if (fareMatch && result.fareYen == null) {
      result.fareYen = Number(fareMatch[1].replace(/,/g, ""));
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
  }

  // ---- 本文部分(■駅名で区切られた区間の連なり) ----
  const stations: string[] = [];
  interface GapDraft {
    lineName: string | null;
    headsign: string | null;
    departurePlatform: string | null;
    arrivalPlatform: string | null;
    departureTime: string | null;
    arrivalTime: string | null;
  }
  const gaps: GapDraft[] = [];
  let current: GapDraft | null = null;
  let inFareBreakdown = false;
  const fareBreakdown: Record<string, number> = {};

  for (const line of bodyLines) {
    if (/運賃内訳/.test(line)) {
      inFareBreakdown = true;
      continue;
    }

    if (inFareBreakdown) {
      // 「新大阪〜東京 4,960円 (特急自由席料金)」のようにカンマ区切りや
      // 末尾の注記が付く場合があるため、行末までの厳密一致は求めない。
      const breakdownMatch = line.match(/^(.+?)[〜~](.+?)\s+([\d,]+)\s*円/);
      if (breakdownMatch) {
        const [, a, b, yen] = breakdownMatch;
        fareBreakdown[`${a.trim()}|${b.trim()}`] = Number(yen.replace(/,/g, ""));
        continue;
      }
    }

    const stationMatch = line.match(/^■\s*(.+)$/);
    if (stationMatch) {
      if (stations.length > 0) {
        gaps.push(
          current ?? {
            lineName: null,
            headsign: null,
            departurePlatform: null,
            arrivalPlatform: null,
            departureTime: null,
            arrivalTime: null,
          }
        );
      }
      stations.push(stationMatch[1].trim());
      current = {
        lineName: null,
        headsign: null,
        departurePlatform: null,
        arrivalPlatform: null,
        departureTime: null,
        arrivalTime: null,
      };
      continue;
    }

    if (!current || !line.startsWith("↓")) continue;
    const body = line.replace(/^↓\s*/, "").trim();

    const segTimeMatch = body.match(/^(\d{1,2}:\d{2})[〜~](\d{1,2}:\d{2})$/);
    if (segTimeMatch) {
      current.departureTime = segTimeMatch[1];
      current.arrivalTime = segTimeMatch[2];
      continue;
    }

    const platformMatch = body.match(/^(\d+)番線発\s*[→⇒]\s*(\d+)番線着$/);
    if (platformMatch) {
      current.departurePlatform = platformMatch[1];
      current.arrivalPlatform = platformMatch[2];
      continue;
    }

    if (!current.lineName && (body.includes("線") || /徒歩|バス/.test(body))) {
      const parts = body.split(/\s+/);
      current.lineName = parts[0];
      current.headsign = parts.slice(1).join(" ") || null;
    }
  }

  result.segments = gaps.map((gap, i) => {
    const fromName = stations[i];
    const toName = stations[i + 1];
    const durationMinutes =
      gap.departureTime && gap.arrivalTime ? diffMinutes(gap.departureTime, gap.arrivalTime) : null;
    const fareYen =
      fareBreakdown[`${fromName}|${toName}`] ??
      fareBreakdown[`${fromName}〜${toName}`] ??
      null;
    return {
      fromName,
      toName,
      lineName: gap.lineName,
      headsign: gap.headsign,
      departurePlatform: gap.departurePlatform,
      arrivalPlatform: gap.arrivalPlatform,
      departureTime: gap.departureTime,
      arrivalTime: gap.arrivalTime,
      durationMinutes,
      fareYen,
    };
  });

  // ヘッダーにfromName/toNameが無かった場合、本文の始点・終点から補う
  if (!result.fromName && stations.length > 0) result.fromName = stations[0];
  if (!result.toName && stations.length > 0) result.toName = stations[stations.length - 1];

  return result;
}

const NON_STATION_NAME_SUFFIXES = ["駅", "空港", "港", "ターミナル", "IC", "PA", "SA"];

// Yahoo!乗換案内は駅名の「駅」を省略して表示する仕様のため("大阪駅"→"大阪")、
// そのままGoogle Place APIに渡すと市区町村・都道府県名などと混同されて正しい駅が
// 見つからないことがある。駅名として扱う箇所では、末尾に「駅」を補って曖昧さを減らす。
export function withStationSuffix(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  if (NON_STATION_NAME_SUFFIXES.some((suffix) => trimmed.endsWith(suffix))) return trimmed;
  return `${trimmed}駅`;
}

export function hasAnyParsedData(info: ParsedRouteInfo): boolean {
  return (
    info.fromName != null ||
    info.toName != null ||
    info.durationMinutes != null ||
    info.fareYen != null ||
    info.distanceMeters != null ||
    info.segments.length > 0
  );
}
