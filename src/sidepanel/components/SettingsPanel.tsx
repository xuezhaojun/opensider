import { useState } from "react";
import { useChatStore } from "../store/chat";
import { MSG } from "@/shared/types";

interface Props {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: Props) {
  const { serverUrl, setServerUrl, setConnected } = useChatStore();
  const [url, setUrl] = useState(serverUrl);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "connecting" | "success" | "error">("idle");

  const handleConnect = async () => {
    setStatus("connecting");
    try {
      const response = await chrome.runtime.sendMessage({
        type: MSG.CONNECT,
        payload: { baseUrl: url, password: password || undefined },
      });
      if (response.connected) {
        setServerUrl(url);
        setConnected(true);
        setStatus("success");
        setTimeout(onClose, 800);
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Settings
        </h2>
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-lg"
        >
          x
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
            OpenCode Server URL
          </label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:4096"
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
            Password (optional)
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Leave empty if no auth"
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
        </div>

        <button
          onClick={handleConnect}
          disabled={status === "connecting"}
          className="w-full rounded-lg bg-blue-600 px-3 py-2 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {status === "connecting"
            ? "Connecting..."
            : status === "success"
              ? "Connected!"
              : status === "error"
                ? "Failed - Retry"
                : "Connect"}
        </button>

        <p className="text-xs text-zinc-500">
          Start OpenCode server with:{" "}
          <code className="bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded">
            opencode serve
          </code>
        </p>
      </div>
    </div>
  );
}
