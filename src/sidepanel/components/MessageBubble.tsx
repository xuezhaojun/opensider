import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { ChatMessage } from "@/shared/types";

interface Props {
  message: ChatMessage;
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div
        className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-blue-600 text-white rounded-br-sm"
            : "bg-zinc-100 text-zinc-900 rounded-bl-sm dark:bg-zinc-800 dark:text-zinc-100"
        }`}
      >
        {message.context && isUser && (
          <div className="mb-1.5 text-xs opacity-70 border-b border-current/20 pb-1.5">
            Page: {message.context.title}
            {message.context.selectedText && (
              <span className="block mt-0.5 italic truncate">
                "{message.context.selectedText.slice(0, 80)}..."
              </span>
            )}
          </div>
        )}

        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none [&_pre]:bg-zinc-900 [&_pre]:text-zinc-100 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:overflow-x-auto [&_code]:text-xs [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5">
            <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {message.content || "Thinking..."}
            </Markdown>
          </div>
        )}
      </div>
    </div>
  );
}
