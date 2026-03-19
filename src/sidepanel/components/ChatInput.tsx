import { useState, useRef, useEffect } from "react";
import { useChatStore } from "../store/chat";

const SLASH_COMMANDS = [
  { cmd: "/explain", label: "Explain selected content" },
  { cmd: "/translate", label: "Translate to English/Chinese" },
  { cmd: "/summarize", label: "Summarize current page" },
  { cmd: "/improve", label: "Improve writing" },
  { cmd: "/code", label: "Code-related help" },
];

export function ChatInput() {
  const [input, setInput] = useState("");
  const [showSlash, setShowSlash] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { sendMessage, isStreaming, isConnected } = useChatStore();

  const filteredCommands = SLASH_COMMANDS.filter((c) =>
    c.cmd.startsWith(`/${slashFilter}`)
  );

  useEffect(() => {
    if (input.startsWith("/")) {
      setShowSlash(true);
      setSlashFilter(input.slice(1));
    } else {
      setShowSlash(false);
    }
  }, [input]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    sendMessage(trimmed);
    setInput("");
    setShowSlash(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const selectCommand = (cmd: string) => {
    setInput(cmd + " ");
    setShowSlash(false);
    textareaRef.current?.focus();
  };

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
    }
  }, [input]);

  return (
    <div className="border-t border-zinc-200 dark:border-zinc-700 p-3">
      {/* Slash command menu */}
      {showSlash && filteredCommands.length > 0 && (
        <div className="mb-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg overflow-hidden">
          {filteredCommands.map((c) => (
            <button
              key={c.cmd}
              onClick={() => selectCommand(c.cmd)}
              className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2"
            >
              <span className="font-mono text-blue-600 dark:text-blue-400">
                {c.cmd}
              </span>
              <span className="text-zinc-500 text-xs">{c.label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isConnected ? 'Ask anything... (type "/" for commands)' : "Not connected to OpenCode"
          }
          disabled={!isConnected}
          rows={1}
          className="flex-1 resize-none rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          onClick={handleSubmit}
          disabled={!input.trim() || isStreaming || !isConnected}
          className="rounded-lg bg-blue-600 px-3 py-2 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          {isStreaming ? (
            <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            "Send"
          )}
        </button>
      </div>
    </div>
  );
}
