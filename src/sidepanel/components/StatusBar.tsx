import { useChatStore } from "../store/chat";

export function StatusBar() {
  const { isConnected, pageContext, clearMessages } = useChatStore();

  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-xs">
      <div className="flex items-center gap-2">
        <div
          className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`}
        />
        <span className="text-zinc-600 dark:text-zinc-400">
          {isConnected ? "Connected" : "Disconnected"}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {pageContext && (
          <span
            className="text-zinc-500 dark:text-zinc-400 truncate max-w-[150px]"
            title={pageContext.title}
          >
            {pageContext.title}
          </span>
        )}
        <button
          onClick={clearMessages}
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
          title="Clear chat"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
