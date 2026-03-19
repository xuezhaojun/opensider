import { create } from "zustand";
import type { ChatMessage, PageContext } from "@/shared/types";
import { MSG } from "@/shared/types";

interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  isConnected: boolean;
  pageContext: PageContext | null;
  serverUrl: string;

  setConnected: (connected: boolean) => void;
  setPageContext: (ctx: PageContext | null) => void;
  setServerUrl: (url: string) => void;

  sendMessage: (content: string) => void;
  addUserMessage: (content: string, context?: PageContext) => void;
  updateAssistantMessage: (content: string) => void;
  finishStreaming: (content: string) => void;
  setStreamError: (error: string) => void;
  clearMessages: () => void;
}

let messageCounter = 0;
function genId() {
  return `msg-${Date.now()}-${messageCounter++}`;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  isConnected: false,
  pageContext: null,
  serverUrl: "http://localhost:4096",

  setConnected: (connected) => set({ isConnected: connected }),
  setPageContext: (ctx) => set({ pageContext: ctx }),
  setServerUrl: (url) => set({ serverUrl: url }),

  sendMessage: (content: string) => {
    const { pageContext } = get();

    // Add user message
    get().addUserMessage(content, pageContext || undefined);

    // Start streaming
    set({ isStreaming: true });

    // Add empty assistant message placeholder
    const assistantMsg: ChatMessage = {
      id: genId(),
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };
    set((state) => ({
      messages: [...state.messages, assistantMsg],
    }));

    // Send to background
    chrome.runtime.sendMessage({
      type: MSG.SEND_MESSAGE,
      payload: {
        content,
        context: pageContext || undefined,
      },
    });
  },

  addUserMessage: (content, context) => {
    const msg: ChatMessage = {
      id: genId(),
      role: "user",
      content,
      timestamp: Date.now(),
      context,
    };
    set((state) => ({ messages: [...state.messages, msg] }));
  },

  updateAssistantMessage: (content) => {
    set((state) => {
      const msgs = [...state.messages];
      const lastIdx = msgs.length - 1;
      if (lastIdx >= 0 && msgs[lastIdx].role === "assistant") {
        msgs[lastIdx] = { ...msgs[lastIdx], content };
      }
      return { messages: msgs };
    });
  },

  finishStreaming: (content) => {
    set((state) => {
      const msgs = [...state.messages];
      const lastIdx = msgs.length - 1;
      if (lastIdx >= 0 && msgs[lastIdx].role === "assistant") {
        msgs[lastIdx] = { ...msgs[lastIdx], content };
      }
      return { messages: msgs, isStreaming: false };
    });
  },

  setStreamError: (error) => {
    set((state) => {
      const msgs = [...state.messages];
      const lastIdx = msgs.length - 1;
      if (lastIdx >= 0 && msgs[lastIdx].role === "assistant") {
        msgs[lastIdx] = {
          ...msgs[lastIdx],
          content: `Error: ${error}`,
        };
      }
      return { messages: msgs, isStreaming: false };
    });
  },

  clearMessages: () => set({ messages: [] }),
}));
