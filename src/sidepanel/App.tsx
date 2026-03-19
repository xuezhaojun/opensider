import { useEffect, useRef, useState } from "react";
import { useChatStore } from "./store/chat";
import { MessageBubble } from "./components/MessageBubble";
import { ChatInput } from "./components/ChatInput";
import { StatusBar } from "./components/StatusBar";
import { SettingsPanel } from "./components/SettingsPanel";
import { MSG } from "@/shared/types";

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
  } = useChatStore();
  const [showSettings, setShowSettings] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

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
          const prompts: Record<string, string> = {
            explain: `/explain ${text}`,
            translate: `/translate ${text}`,
            summarize: `/summarize ${text}`,
          };
          storeSendMessage(prompts[action] || text);
          break;
        }
        case MSG.PAGE_CONTEXT:
          setPageContext(message.payload);
          break;
      }
    };

    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [updateAssistantMessage, finishStreaming, setStreamError, storeSendMessage, setPageContext]);

  // Check connection on mount
  useEffect(() => {
    chrome.runtime.sendMessage({ type: MSG.CONNECTION_STATUS }).then((res) => {
      setConnected(res?.connected || false);
      if (!res?.connected) {
        setShowSettings(true);
      }
    }).catch(() => {
      setConnected(false);
      setShowSettings(true);
    });
  }, [setConnected]);

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-200 dark:border-zinc-700">
        <h1 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
          OpenSider
        </h1>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-sm"
          title="Settings"
        >
          {showSettings ? "Chat" : "Settings"}
        </button>
      </div>

      {showSettings ? (
        <SettingsPanel onClose={() => setShowSettings(false)} />
      ) : (
        <>
          <StatusBar />

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-3 space-y-1"
          >
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-zinc-400 text-sm space-y-2">
                <p className="text-lg font-semibold">OpenSider</p>
                <p>Connected to local OpenCode server</p>
                <p className="text-xs">
                  Select text on any page for quick actions
                </p>
                <p className="text-xs">
                  Type "/" for slash commands
                </p>
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
