import { useState } from "react";
import { useTripStore } from "../../store/useTripStore";
import { hasDefaultGeminiApiKey, hasDefaultGoogleMapsApiKey } from "../../lib/apiKeys";

export function SettingsPage() {
  const settings = useTripStore((s) => s.settings);
  const updateSettings = useTripStore((s) => s.actions.updateSettings);
  const [apiKeyInput, setApiKeyInput] = useState(settings.googleMapsApiKey ?? "");
  const [geminiKeyInput, setGeminiKeyInput] = useState(settings.geminiApiKey ?? "");

  const usingSharedMapsKey = !settings.googleMapsApiKey && hasDefaultGoogleMapsApiKey();
  const usingSharedGeminiKey = !settings.geminiApiKey && hasDefaultGeminiApiKey();

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <h3>Google Maps API (場所検索・経路計算に使用)</h3>
        </div>
        {usingSharedMapsKey && (
          <p className="muted">
            ✓ 共通のAPIキーが設定されているため、未入力のままでも利用できます。自分のキーを使いたい場合のみ入力してください。
          </p>
        )}
        <div className="field">
          <label>Google Maps APIキー{usingSharedMapsKey ? "（任意・上書き用）" : ""}</label>
          <input
            type="password"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder={usingSharedMapsKey ? "未入力の場合は共通キーを使用" : "AIza..."}
          />
        </div>
        <p className="muted">
          APIキーはこの端末のブラウザ内(localStorage)にのみ保存され、Google Maps
          APIへ直接送信されます。未設定でも手動入力でアプリ自体は問題なく利用できます。
        </p>
        <button
          className="btn btn-primary"
          onClick={() => updateSettings({ googleMapsApiKey: apiKeyInput || null })}
        >
          保存
        </button>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Gemini API (乗換案内のスクリーンショット読み取りに使用)</h3>
        </div>
        {usingSharedGeminiKey && (
          <p className="muted">
            ✓ 共通のAPIキーが設定されているため、未入力のままでも利用できます。自分のキーを使いたい場合のみ入力してください。
          </p>
        )}
        <div className="field">
          <label>Gemini APIキー{usingSharedGeminiKey ? "（任意・上書き用）" : ""}</label>
          <input
            type="password"
            value={geminiKeyInput}
            onChange={(e) => setGeminiKeyInput(e.target.value)}
            placeholder={usingSharedGeminiKey ? "未入力の場合は共通キーを使用" : "AIza..."}
          />
        </div>
        <p className="muted">
          APIキーはこの端末のブラウザ内(localStorage)にのみ保存され、Gemini
          APIへ直接送信されます。未設定でもテキストの貼り付けはそのまま利用できます。
        </p>
        <button
          className="btn btn-primary"
          onClick={() => updateSettings({ geminiApiKey: geminiKeyInput || null })}
        >
          保存
        </button>
      </div>
    </div>
  );
}
