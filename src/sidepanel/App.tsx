import { useEffect, useRef, useState } from "react";
import { useChatStore } from "./store/chat";
import { MessageBubble } from "./components/MessageBubble";
import { ChatInput } from "./components/ChatInput";
import { StatusBar } from "./components/StatusBar";
import { SettingsPanel } from "./components/SettingsPanel";
import { MSG } from "@/shared/types";
import type { PageContext } from "@/shared/types";

type ViewMode = "webui" | "chat" | "settings";

// Inject page context into OpenCode via TUI API (through service worker to avoid CORS)
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
    messages,
    isConnected,
    setConnected,
    updateAssistantMessage,
    finishStreaming,
    setStreamError,
    sendMessage: storeSendMessage,
    setPageContext,
    serverUrl,
  } = useChatStore();
  const [viewMode, setViewMode] = useState<ViewMode>("webui");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (viewMode === "chat") {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, viewMode]);

  // Listen for stream events and quick actions from background
  useEffect(() => {
    const handler = (message: any) => {
      switch (message.type) {
        case MSG.STREAM_CHUNK:
          updateAssistantMessage(message.payload.content);
          break;
        case MSG.STREAM_DONE:
          finishStreaming(message.payload.content);
          break;
        case MSG.STREAM_ERROR:
          setStreamError(message.payload.error);
          break;
        case MSG.QUICK_ACTION: {
          const { action, text, context } = message.payload;
          if (context) setPageContext(context);

          if (viewMode === "webui" && isConnected) {
            // In WebUI mode, inject via TUI API
            injectContextViaTUI(action, text, context);
          } else {
            // In chat mode, use our own chat
            const prompts: Record<string, string> = {
              explain: `/explain ${text}`,
              translate: `/translate ${text}`,
              summarize: `/summarize ${text}`,
            };
            storeSendMessage(prompts[action] || text);
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
  }, [viewMode, isConnected, updateAssistantMessage, finishStreaming, setStreamError, storeSendMessage, setPageContext]);

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
        <div className="flex items-center gap-0.5">
          <HeaderButton
            active={viewMode === "webui"}
            onClick={() => setViewMode("webui")}
            label="WebUI"
          />
          <HeaderButton
            active={viewMode === "chat"}
            onClick={() => setViewMode("chat")}
            label="Chat"
          />
          <HeaderButton
            active={viewMode === "settings"}
            onClick={() => setViewMode("settings")}
            label="Settings"
          />
        </div>
      </div>

      {/* Content */}
      {viewMode === "settings" ? (
        <SettingsPanel onClose={() => setViewMode(isConnected ? "webui" : "settings")} />
      ) : viewMode === "webui" ? (
        isConnected ? (
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
        )
      ) : (
        <>
          <StatusBar />
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-3 space-y-1"
          >
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-zinc-400 text-sm space-y-2">
                <p>Select text on any page for quick actions</p>
                <p className="text-xs">Type "/" for slash commands</p>
              </div>
            )}
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </div>
          <ChatInput />
        </>
      )}
    </div>
  );
}

function HeaderButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 text-xs rounded transition-colors ${
        active
          ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 font-medium"
          : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
      }`}
    >
      {label}
    </button>
  );
}
