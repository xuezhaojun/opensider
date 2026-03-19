import { useState, useEffect, useCallback } from "react";
import { useChatStore } from "../store/chat";
import { MSG } from "@/shared/types";

interface Props {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: Props) {
  const { serverUrl, setServerUrl, setConnected, isConnected } = useChatStore();
  const [url, setUrl] = useState(serverUrl);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "connecting" | "success" | "error">("idle");
  const [autoStartStatus, setAutoStartStatus] = useState<"idle" | "starting" | "success" | "error">("idle");
  const [autoStartError, setAutoStartError] = useState("");
  const [nativeHostStatus, setNativeHostStatus] = useState<{
    checked: boolean;
    available: boolean;
    running: boolean;
    managed: boolean;
    port: number;
  }>({ checked: false, available: false, running: false, managed: false, port: 4096 });

  // Query native host and connection status on mount
  useEffect(() => {
    chrome.runtime.sendMessage({ type: MSG.SERVER_STATUS }).then((res) => {
      setNativeHostStatus({
        checked: true,
        available: true,
        running: res.running || false,
        managed: res.managed || false,
        port: res.port || 4096,
      });
      if (res.running) {
        setAutoStartStatus("success");
      }
    }).catch(() => {
      setNativeHostStatus((prev) => ({ ...prev, checked: true, available: false }));
    });

    if (isConnected) {
      setStatus("success");
    }
  }, [isConnected]);

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

  const handleAutoStart = async () => {
    setAutoStartStatus("starting");
    setAutoStartError("");
    try {
      const result = await chrome.runtime.sendMessage({
        type: MSG.AUTO_START,
        payload: { port: 4096 },
      });
      if (result.success) {
        setAutoStartStatus("success");
        setNativeHostStatus((prev) => ({ ...prev, running: true, managed: true, port: result.port }));
        setServerUrl(`http://localhost:${result.port}`);
        setUrl(`http://localhost:${result.port}`);
        // Auto-connect after server starts
        setStatus("connecting");
        const connectResult = await chrome.runtime.sendMessage({
          type: MSG.CONNECT,
          payload: { baseUrl: `http://localhost:${result.port}`, autoStart: true, port: result.port },
        });
        if (connectResult.connected) {
          setConnected(true);
          setStatus("success");
          setTimeout(onClose, 800);
        } else {
          setStatus("error");
        }
      } else {
        setAutoStartStatus("error");
        setAutoStartError(result.error || "Failed to start server");
      }
    } catch {
      setAutoStartStatus("error");
      setAutoStartError("Native host not installed. Run the install command below first.");
    }
  };

  const isServerConnected = isConnected && (status === "success" || status === "idle");

  return (
    <div className="p-4 space-y-4 overflow-y-auto">
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

      {/* Connection Status */}
      {isServerConnected && (
        <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <div className="flex-1">
            <p className="text-xs font-medium text-green-800 dark:text-green-300">
              Connected to OpenCode
            </p>
            <p className="text-xs text-green-600 dark:text-green-400">{serverUrl}</p>
          </div>
        </div>
      )}

      {/* Auto Start Section */}
      <div className="space-y-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-blue-800 dark:text-blue-300">
            Auto Start (Recommended)
          </p>
          {nativeHostStatus.checked && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              nativeHostStatus.available
                ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
            }`}>
              {nativeHostStatus.available ? "Host installed" : "Host not found"}
            </span>
          )}
        </div>

        {nativeHostStatus.available && nativeHostStatus.running && isServerConnected ? (
          <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-400">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Server running on port {nativeHostStatus.port}
          </div>
        ) : (
          <>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              Automatically start OpenCode server via native host.
            </p>
            <button
              onClick={handleAutoStart}
              disabled={autoStartStatus === "starting"}
              className="w-full rounded-lg bg-blue-600 px-3 py-2 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {autoStartStatus === "starting"
                ? "Starting server..."
                : autoStartStatus === "error"
                  ? "Failed - Retry"
                  : "Start OpenCode Server"}
            </button>
          </>
        )}

        {autoStartError && (
          <p className="text-xs text-red-600 dark:text-red-400">{autoStartError}</p>
        )}

        {/* Install command - belongs here since it's part of auto-start setup */}
        {!nativeHostStatus.available && (
          <CopyableCommand
            label="Install native host (one-time, run from project root)"
            command={`./scripts/install-host.sh ${chrome.runtime.id}`}
          />
        )}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <div className="flex-1 border-t border-zinc-200 dark:border-zinc-700" />
        <span>or connect manually</span>
        <div className="flex-1 border-t border-zinc-200 dark:border-zinc-700" />
      </div>

      {/* Manual Connect Section */}
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
          className="w-full rounded-lg bg-zinc-700 px-3 py-2 text-white text-sm font-medium hover:bg-zinc-600 disabled:opacity-50 transition-colors"
        >
          {status === "connecting"
            ? "Connecting..."
            : status === "success"
              ? "Connected!"
              : status === "error"
                ? "Failed - Retry"
                : "Connect Manually"}
        </button>

        <CopyableCommand
          label="Start server manually"
          command={`opencode serve --cors "chrome-extension://${chrome.runtime.id}"`}
        />
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
