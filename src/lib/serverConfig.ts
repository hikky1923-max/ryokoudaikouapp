import { create } from "zustand";

// サーバー(/api/config)から受け取る設定。APIキーはVercelの環境変数に置き、
// ユーザーが入力する必要はない。Geminiのキーはブラウザに渡らず、使えるかどうかだけを受け取る。
interface ServerConfig {
  loaded: boolean;
  googleMapsApiKey: string | null;
  geminiAvailable: boolean;
}

export const useServerConfig = create<ServerConfig>(() => ({
  loaded: false,
  googleMapsApiKey: null,
  geminiAvailable: false,
}));

let loadPromise: Promise<ServerConfig> | null = null;

export function loadServerConfig(): Promise<ServerConfig> {
  loadPromise ??= fetch("/api/config")
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null)
    .then((data) => {
      const config: ServerConfig = {
        loaded: true,
        googleMapsApiKey: data?.googleMapsApiKey ?? null,
        geminiAvailable: Boolean(data?.geminiAvailable),
      };
      useServerConfig.setState(config);
      return config;
    });
  return loadPromise;
}
