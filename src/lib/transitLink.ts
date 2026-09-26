// 公共交通機関の実際の時刻はスクレイピングせず、Yahoo!乗換案内への通常の外部リンクを
// 組み立てるだけに留める(ネットワーク呼び出し・ToS上の懸念なし)。ユーザー自身がリンク先で
// 調べた時刻を手動でLegに入力する運用を前提とする。
export function buildYahooTransitSearchUrl(fromName: string, toName: string): string {
  const params = new URLSearchParams({ from: fromName, to: toName });
  return `https://transit.yahoo.co.jp/search/result?${params.toString()}`;
}
