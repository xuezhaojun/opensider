import { useState, useCallback } from "react";
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

        <div className="mt-2 space-y-2">
          <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Quick Start
          </p>
          <CopyableCommand
            label="1. Start OpenCode server"
            command="opencode serve"
          />
          <CopyableCommand
            label="2. Enable CORS for this extension"
            command={`opencode serve --cors "chrome-extension://${chrome.runtime.id}"`}
          />
        </div>
      </div>
    </div>
  );
}

function CopyableCommand({ label, command }: { label: string; command: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [command]);

  return (
    <div className="text-xs">
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <div
        onClick={handleCopy}
        className="mt-0.5 flex items-center justify-between gap-2 bg-zinc-900 dark:bg-zinc-950 text-zinc-100 rounded-md px-2.5 py-1.5 cursor-pointer hover:bg-zinc-800 transition-colors group"
      >
        <code className="break-all">{command}</code>
        <span className="shrink-0 text-zinc-400 group-hover:text-zinc-200 transition-colors">
          {copied ? "Copied!" : "Copy"}
        </span>
      </div>
    </div>
  );
}
