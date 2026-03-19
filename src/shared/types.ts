// Message types for chrome.runtime communication between components
export const MSG = {
  // Connection
  CONNECT: "opensider:connect",
  DISCONNECT: "opensider:disconnect",
  CONNECTION_STATUS: "opensider:connection-status",

  // Chat
  SEND_MESSAGE: "opensider:send-message",
  STREAM_CHUNK: "opensider:stream-chunk",
  STREAM_DONE: "opensider:stream-done",
  STREAM_ERROR: "opensider:stream-error",

  // Context
  PAGE_CONTEXT: "opensider:page-context",
  QUICK_ACTION: "opensider:quick-action",

  // Side Panel
  OPEN_SIDEPANEL: "opensider:open-sidepanel",

  // Session
  LIST_SESSIONS: "opensider:list-sessions",
  SWITCH_SESSION: "opensider:switch-session",
  NEW_SESSION: "opensider:new-session",

  // Native Host / Auto-start
  AUTO_START: "opensider:auto-start",
  SERVER_STATUS: "opensider:server-status",

  // TUI API
  INJECT_PROMPT: "opensider:inject-prompt",
} as const;

export interface PageContext {
  url: string;
  title: string;
  selectedText?: string;
  bodySnippet?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  context?: PageContext;
}

export interface ConnectionConfig {
  baseUrl: string;
  password?: string;
  autoStart?: boolean;
  port?: number;
}

export type QuickAction = "explain" | "translate" | "summarize" | "improve" | "ask";
