import { useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent } from "react";
import { useTripStore } from "../../store/useTripStore";
import { useGoogleMapsReady } from "../../hooks/useGoogleMapsReady";
import { attachPlaceAutocomplete, type PlaceSelection } from "../../lib/googleMaps";
import { extractRouteFromImage } from "../../lib/gemini";
import { resolveGeminiApiKey } from "../../lib/apiKeys";
import {
  diffMinutes,
  hasAnyParsedData,
  parseTransitShareText,
  withStationSuffix,
  type ParsedRouteInfo,
  type ParsedSegment,
} from "../../lib/routeTextParser";
import type { ID, LegMode, StopCategory } from "../../types";

// Geminiによる画像からの抽出結果(routeTextParser.tsのテキスト解析結果とはやや形が異なる)を、
// 以降の処理で共通して使えるParsedRouteInfoの形に変換する。
function toParsedRouteInfo(extracted: {
  date: string | null;
  durationMinutes: number | null;
  fareYen: number | null;
  distanceMeters: number | null;
  segments: {
    fromName: string;
    toName: string;
    lineName: string | null;
    headsign: string | null;
    departurePlatform: string | null;
    arrivalPlatform: string | null;
    departureTime: string | null;
    arrivalTime: string | null;
  }[];
}): ParsedRouteInfo {
  const segments: ParsedSegment[] = extracted.segments.map((s) => ({
    fromName: s.fromName,
    toName: s.toName,
    lineName: s.lineName,
    headsign: s.headsign,
    departurePlatform: s.departurePlatform,
    arrivalPlatform: s.arrivalPlatform,
    departureTime: s.departureTime,
    arrivalTime: s.arrivalTime,
    durationMinutes:
      s.departureTime && s.arrivalTime ? diffMinutes(s.departureTime, s.arrivalTime) : null,
    fareYen: null,
  }));
  return {
    fromName: segments[0]?.fromName ?? null,
    toName: segments[segments.length - 1]?.toName ?? null,
    date: extracted.date,
    departureTime: segments[0]?.departureTime ?? null,
    arrivalTime: segments[segments.length - 1]?.arrivalTime ?? null,
    durationMinutes: extracted.durationMinutes,
    fareYen: extracted.fareYen,
    transferCount: Math.max(0, segments.length - 1),
    distanceMeters: extracted.distanceMeters,
    segments,
  };
}

const CATEGORY_LABEL: Record<StopCategory, string> = {
  activity: "アクティビティ",
  lodging: "宿泊",
  other: "その他",
};

export function ImportRouteForm({ tripId, onDone }: { tripId: ID; onDone?: () => void }) {
  const { ready } = useGoogleMapsReady();
  const userGeminiApiKey = useTripStore((s) => s.settings.geminiApiKey);
  const geminiApiKey = resolveGeminiApiKey(userGeminiApiKey);
  const placeInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [movementMode, setMovementMode] = useState<LegMode>("transit");
  const [transitInputMethod, setTransitInputMethod] = useState<"text" | "image">("text");

  const [pasteText, setPasteText] = useState("");
  const [parsed, setParsed] = useState<ParsedRouteInfo | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);

  const [placeName, setPlaceName] = useState("");
  const [placeSelection, setPlaceSelection] = useState<PlaceSelection | null>(null);
  const [placeCategory, setPlaceCategory] = useState<StopCategory>("activity");
  const [placeStayMinutes, setPlaceStayMinutes] = useState(60);

  const [addError, setAddError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  const showPlaceStep = movementMode === "walk" || parsed != null;

  useEffect(() => {
    if (!ready || !placeInputRef.current || !showPlaceStep) return;
    const detach = attachPlaceAutocomplete(placeInputRef.current, (place) => {
      setPlaceSelection(place);
      setPlaceName(place.name);
    });
    return detach;
  }, [ready, showPlaceStep]);

  function handleModeChange(mode: LegMode) {
    setMovementMode(mode);
    setParsed(null);
    setParseError(null);
    setAddError(null);
    if (mode === "walk") {
      setPlaceName("");
      setPlaceSelection(null);
    }
  }

  function applyParsedInfo(info: ParsedRouteInfo) {
    setParsed(info);
    setParseError(null);
    const lastSegment = info.segments[info.segments.length - 1];
    // 到着地名は乗換案内が返した表記のまま使う。既に「東京ディズニーリゾート」のような
    // 施設名の場合もあるため、ここで機械的に「駅」を補うと誤った名前になってしまう。
    // ユーザーがこの後の②で名前を確認・編集する前提。
    setPlaceName(lastSegment.toName);
    setPlaceSelection(null);
  }

  function handleParse() {
    const info = parseTransitShareText(pasteText);
    if (!hasAnyParsedData(info) || info.segments.length === 0) {
      setParsed(null);
      setParseError(
        "経路情報を読み取れませんでした。出発地・到着地を含むYahoo!乗換案内の共有テキストを貼り付けてください。"
      );
      return;
    }
    applyParsedInfo(info);
  }

  async function handleImageFile(file: File) {
    if (!geminiApiKey) {
      setParseError("Gemini APIキーが設定されていません。設定画面から登録してください。");
      return;
    }
    setExtracting(true);
    setParseError(null);
    try {
      const extracted = await extractRouteFromImage(geminiApiKey, file);
      const info = toParsedRouteInfo(extracted);
      if (info.segments.length === 0) {
        setParsed(null);
        setParseError("画像から経路情報を読み取れませんでした。別の画像でお試しください。");
        return;
      }
      applyParsedInfo(info);
    } catch (e) {
      setParsed(null);
      setParseError((e as Error).message);
    } finally {
      setExtracting(false);
    }
  }

  function handleFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleImageFile(file);
    e.target.value = "";
  }

  function handlePaste(e: ClipboardEvent<HTMLDivElement>) {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    const file = item?.getAsFile();
    if (file) handleImageFile(file);
  }

  function handleAdd() {
    if (!placeName.trim()) return;
    if (movementMode === "transit" && !parsed) return;

    const { stops, actions } = useTripStore.getState();
    const tripStops = Object.values(stops)
      .filter((s) => s.tripId === tripId)
      .sort((a, b) => a.order - b.order);
    const lastStop = tripStops[tripStops.length - 1];

    let originId: ID;
    if (lastStop) {
      originId = lastStop.id;
    } else if (movementMode === "transit" && parsed) {
      // 旅程の一番最初だけは「出発地点」となるStopがまだ存在しないため、
      // 移動方法に含まれる出発駅名を仮の出発地点として作成する。ここはユーザーが
      // 見直す機会が無いまま保存されるので、省略されがちな「駅」を補っておく。
      const firstSegment = parsed.segments[0];
      originId = actions.addStop(tripId, {
        name: withStationSuffix(firstSegment.fromName),
        category: "other",
        stayDurationMinutes: 0,
      });
      const startTime = firstSegment.departureTime ?? parsed.departureTime;
      if (parsed.date && startTime) {
        actions.updateStop(originId, { arrivalTime: `${parsed.date}T${startTime}` });
      }
    } else {
      setAddError(
        "最初の場所は出発地点がまだ無いため、徒歩からは追加できません。「場所を手動で追加」から最初の場所を追加してください。"
      );
      return;
    }

    if (movementMode === "walk" || !parsed) {
      const destinationId = actions.addStop(tripId, {
        name: placeName.trim(),
        placeId: placeSelection?.placeId ?? null,
        lat: placeSelection?.lat ?? null,
        lng: placeSelection?.lng ?? null,
        category: placeCategory,
        stayDurationMinutes: placeStayMinutes,
      });
      const legs = Object.values(useTripStore.getState().legs);
      const leg = legs.find((l) => l.fromStopId === originId && l.toStopId === destinationId);
      if (leg) {
        actions.setLegOverride(leg.id, {
          mode: "walk",
          durationMinutes: null,
          distanceMeters: null,
          cost: null,
          transitDetails: null,
        });
      }
    } else {
      // 徒歩⇔電車・バスの切り替わり地点だけを実際のStopとして区切る。
      // (例: 電車→電車の乗換駅は1つのLegにまとめ、電車→徒歩に変わる駅だけ独立したStopにする)
      type Run = { kind: "walk" | "transit"; segments: ParsedSegment[] };
      const runs: Run[] = [];
      for (const segment of parsed.segments) {
        const kind: Run["kind"] = segment.lineName === "徒歩" ? "walk" : "transit";
        const currentRun = runs[runs.length - 1];
        if (currentRun && currentRun.kind === kind) {
          currentRun.segments.push(segment);
        } else {
          runs.push({ kind, segments: [segment] });
        }
      }

      let lastTransitRunIndex = -1;
      runs.forEach((run, i) => {
        if (run.kind === "transit") lastTransitRunIndex = i;
      });

      let currentStopId = originId;
      runs.forEach((run, i) => {
        const isLastRun = i === runs.length - 1;
        const runFirst = run.segments[0];
        const runLast = run.segments[run.segments.length - 1];

        const boundaryStopId = isLastRun
          ? actions.addStop(tripId, {
              name: placeName.trim(),
              placeId: placeSelection?.placeId ?? null,
              lat: placeSelection?.lat ?? null,
              lng: placeSelection?.lng ?? null,
              category: placeCategory,
              stayDurationMinutes: placeStayMinutes,
            })
          : actions.addStop(tripId, {
              // 途中の乗換・切替駅は基本的に滞在時間0の中継地点として扱う。
              // ②のようにユーザーが確認する機会が無いため、省略されがちな「駅」を補っておく。
              name: withStationSuffix(runLast.toName),
              category: "other",
              stayDurationMinutes: 0,
            });

        const runDurationMinutes =
          runFirst.departureTime && runLast.arrivalTime
            ? diffMinutes(runFirst.departureTime, runLast.arrivalTime)
            : (run.segments.reduce(
                (sum, s) => (s.durationMinutes != null ? sum + s.durationMinutes : sum),
                0
              ) || null);

        const legs = Object.values(useTripStore.getState().legs);
        const leg = legs.find((l) => l.fromStopId === currentStopId && l.toStopId === boundaryStopId);
        if (leg) {
          if (run.kind === "walk") {
            actions.setLegOverride(leg.id, {
              mode: "walk",
              durationMinutes: runDurationMinutes,
              distanceMeters: null,
              cost: null,
              transitDetails: null,
            });
          } else {
            actions.setLegOverride(leg.id, {
              mode: "transit",
              durationMinutes: runDurationMinutes,
              distanceMeters: i === lastTransitRunIndex ? parsed.distanceMeters : null,
              cost: i === lastTransitRunIndex ? parsed.fareYen : null,
              transitDetails: run.segments.map((segment) => ({
                lineName: segment.lineName ?? undefined,
                headsign: segment.headsign ?? undefined,
                departureStop: segment.fromName,
                arrivalStop: segment.toName,
                departurePlatform: segment.departurePlatform ?? undefined,
                arrivalPlatform: segment.arrivalPlatform ?? undefined,
              })),
            });
          }
        }

        currentStopId = boundaryStopId;
      });
    }

    setSummary(`追加しました: ${placeName.trim()}`);
    setAddError(null);
    setPasteText("");
    setParsed(null);
    setPlaceName("");
    setPlaceSelection(null);
    onDone?.();
  }

  return (
    <div className="card">
      <div className="import-step">
        <div className="import-step-label">① 移動方法</div>
        <div className="granularity-switch" style={{ marginBottom: 10 }}>
          <button
            className={movementMode === "transit" ? "active" : ""}
            onClick={() => handleModeChange("transit")}
          >
            🚃 乗換案内
          </button>
          <button
            className={movementMode === "walk" ? "active" : ""}
            onClick={() => handleModeChange("walk")}
          >
            🚶 徒歩
          </button>
        </div>

        {movementMode === "transit" ? (
          <>
            <div className="granularity-switch" style={{ marginBottom: 10 }}>
              <button
                className={transitInputMethod === "text" ? "active" : ""}
                onClick={() => setTransitInputMethod("text")}
              >
                📝 テキスト
              </button>
              <button
                className={transitInputMethod === "image" ? "active" : ""}
                onClick={() => setTransitInputMethod("image")}
              >
                📷 スクリーンショット
              </button>
            </div>

            {transitInputMethod === "text" ? (
              <>
                <div className="field">
                  <label>Yahoo!乗換案内の共有テキストを貼り付け</label>
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    rows={5}
                    placeholder={
                      "大阪 ⇒ 森ノ宮\n2026年9月26日(土)\n10:18 ⇒ 10:30\n所要時間 12分\n運賃[IC優先] 180円\n..."
                    }
                  />
                </div>
                <div className="row">
                  <button className="btn btn-sm" onClick={handleParse}>
                    解析する
                  </button>
                </div>
              </>
            ) : (
              <div className="field">
                <label>乗換案内アプリのスクリーンショットを貼り付け、または選択</label>
                <div
                  className="image-drop-zone"
                  tabIndex={0}
                  onPaste={handlePaste}
                >
                  {extracting
                    ? "読み取り中..."
                    : "ここをクリックしてCtrl+V(貼り付け)、またはファイルを選択してください"}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileInputChange}
                  style={{ marginTop: 6 }}
                />
                {!geminiApiKey && (
                  <p className="muted">
                    ⚠ Gemini APIキーが未設定です。設定画面から登録してください。
                  </p>
                )}
              </div>
            )}

            {parsed && (
              <p className="muted">
                ✓{" "}
                {parsed.segments
                  .map((s) => `${s.fromName}→${s.toName}${s.lineName ? `(${s.lineName})` : ""}`)
                  .join(" ・ ")}
                {parsed.durationMinutes != null && ` ・ ${parsed.durationMinutes}分`}
                {parsed.fareYen != null && ` ・ ${parsed.fareYen}円`}
              </p>
            )}
            {parseError && <p className="muted">⚠ {parseError}</p>}
          </>
        ) : (
          <p className="muted">
            徒歩の所要時間は、場所を追加した後に「ルートを計算」ボタンで自動計算できます(Google Maps
            APIキー設定時)。手動で入力することもできます。
          </p>
        )}
      </div>

      {showPlaceStep && (
        <div className="import-step">
          <div className="import-step-label">② 場所</div>
          {movementMode === "transit" && (
            <p className="muted">
              駅名が入っていますが、実際に訪れる場所の名前に書き換えてください(駅そのものが目的地の場合はそのままでOK)。
            </p>
          )}
          <div className="field">
            <label>場所の名前{ready ? "（検索できます）" : ""}</label>
            <input
              ref={placeInputRef}
              value={placeName}
              onChange={(e) => {
                setPlaceName(e.target.value);
                setPlaceSelection(null);
              }}
            />
          </div>
          <div className="row">
            <select
              value={placeCategory}
              onChange={(e) => setPlaceCategory(e.target.value as StopCategory)}
            >
              {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <label className="muted">滞在時間(分)</label>
            <input
              type="number"
              min={0}
              step={5}
              value={placeStayMinutes}
              onChange={(e) => setPlaceStayMinutes(Number(e.target.value) || 0)}
              style={{ width: 72 }}
            />
          </div>
          <div className="row">
            <button className="btn btn-primary btn-sm" onClick={handleAdd}>
              追加する
            </button>
          </div>
          {addError && <p className="muted">⚠ {addError}</p>}
        </div>
      )}

      {summary && <p className="muted">✓ {summary}</p>}
    </div>
  );
}
