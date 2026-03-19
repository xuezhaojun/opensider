import { useState, useEffect } from "react";
import { MSG } from "@/shared/types";
import type { ConnectionConfig } from "@/shared/types";

export function Options() {
  const [url, setUrl] = useState("http://localhost:4096");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "connecting" | "success" | "error">("idle");

  useEffect(() => {
    chrome.storage.local.get("connectionConfig", (result) => {
      const config = result.connectionConfig as ConnectionConfig | undefined;
      if (config) {
        setUrl(config.baseUrl);
        if (config.password) {
          setPassword(config.password);
        }
      }
    });
  }, []);

  const handleSave = async () => {
    setStatus("connecting");
    const config: ConnectionConfig = {
      baseUrl: url,
      password: password || undefined,
    };

    try {
      const response = await chrome.runtime.sendMessage({
        type: MSG.CONNECT,
        payload: config,
      });
      setStatus(response.connected ? "success" : "error");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="max-w-md mx-auto mt-12 p-6">
      <h1 className="text-xl font-bold mb-6 text-zinc-900">
        OpenSider Settings
      </h1>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            OpenCode Server URL
          </label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Password (optional)
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={status === "connecting"}
          className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {status === "connecting"
            ? "Connecting..."
            : status === "success"
              ? "Connected!"
              : status === "error"
                ? "Connection Failed - Retry"
                : "Save & Connect"}
        </button>

        <div className="mt-6 p-4 bg-zinc-50 rounded-lg text-sm text-zinc-600 space-y-2">
          <p className="font-medium">Quick Start:</p>
          <p>
            1. Install OpenCode:{" "}
            <code className="bg-zinc-200 px-1 rounded">
              npm i -g opencode
            </code>
          </p>
          <p>
            2. Start server:{" "}
            <code className="bg-zinc-200 px-1 rounded">opencode serve</code>
          </p>
          <p>3. Enter the server URL above and click Connect</p>
        </div>
      </div>
    </div>
  );
}
