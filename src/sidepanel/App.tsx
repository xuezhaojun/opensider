import { useEffect, useState } from "react";
import { useChatStore } from "./store/chat";
import { SettingsPanel } from "./components/SettingsPanel";
import { MSG } from "@/shared/types";
import type { PageContext } from "@/shared/types";

type ViewMode = "webui" | "settings";

// Inject page context into OpenCode via TUI API (through service worker)
function injectContextViaTUI(
  action: string,
  text: string,
  context: PageContext
) {
  const contextPrefix = context.title
    ? `[Page: ${context.title}](${context.url})\n\n`
    : "";

  const prompts: Record<string, string> = {
    explain: `Explain this:\n${text}`,
    translate: `Translate this:\n${text}`,
    summarize: `Summarize this:\n${text}`,
    ask: text,
  };

  const prompt = contextPrefix + (prompts[action] || text);

  chrome.runtime.sendMessage({
    type: MSG.INJECT_PROMPT,
    payload: { prompt },
  }).catch(() => {});
}

export default function App() {
  const {
    isConnected,
    setConnected,
    setPageContext,
    serverUrl,
  } = useChatStore();
  const [viewMode, setViewMode] = useState<ViewMode>("webui");

  // Listen for quick actions from background
  useEffect(() => {
    const handler = (message: any) => {
      switch (message.type) {
        case MSG.QUICK_ACTION: {
          const { action, text, context } = message.payload;
          if (context) setPageContext(context);
          if (isConnected) {
            injectContextViaTUI(action, text, context);
          }
          break;
        }
        case MSG.PAGE_CONTEXT:
          setPageContext(message.payload);
          break;
      }
    };

    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [isConnected, setPageContext]);

  // Check connection on mount
  useEffect(() => {
    chrome.runtime.sendMessage({ type: MSG.CONNECTION_STATUS }).then((res) => {
      setConnected(res?.connected || false);
      if (!res?.connected) {
        setViewMode("settings");
      }
    }).catch(() => {
      setConnected(false);
      setViewMode("settings");
    });
  }, [setConnected]);

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
        <div className="flex items-center gap-1">
          <div
            className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`}
          />
          <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            OpenSider
          </span>
        </div>
        <button
          onClick={() => setViewMode(viewMode === "settings" ? "webui" : "settings")}
          className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
        >
          {viewMode === "settings" ? "Back" : "Settings"}
        </button>
      </div>

      {/* Content */}
      {viewMode === "settings" ? (
        <SettingsPanel onClose={() => setViewMode("webui")} />
      ) : isConnected ? (
        <iframe
          src={serverUrl}
          className="flex-1 w-full border-none"
          allow="clipboard-read; clipboard-write"
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-zinc-400 text-sm space-y-3">
          <p>Not connected to OpenCode server</p>
          <button
            onClick={() => setViewMode("settings")}
            className="text-blue-500 hover:text-blue-600 text-xs"
          >
            Go to Settings
          </button>
        </div>
      )}
    </div>
  );
}
