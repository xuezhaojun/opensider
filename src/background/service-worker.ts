import { MSG } from "@/shared/types";
import type { PageContext, ConnectionConfig } from "@/shared/types";
import {
  setConfig,
  checkConnection,
  sendMessage,
  listSessions,
  createNewSession,
  switchSession,
} from "./opencode";
import { autoStartServer, getServerStatus } from "./native-host";
import { initTabSync } from "./tab-sync";

// Active session ID for the WebUI
let activeSessionId: string | null = null;

// Get the base URL from config
async function getBaseUrl(): Promise<string> {
  const result = await chrome.storage.local.get("connectionConfig");
  const config = (result.connectionConfig as ConnectionConfig) || {
    baseUrl: "http://localhost:4096",
  };
  return config.baseUrl;
}

// Ensure we have an active session, reuse the most recent one or create new
async function ensureActiveSession(baseUrl: string): Promise<string> {
  if (activeSessionId) return activeSessionId;

  const res = await fetch(`${baseUrl}/session`);
  const sessions = await res.json();
  const list = Array.isArray(sessions) ? sessions : Object.values(sessions);

  if (list.length > 0) {
    // Sort by most recently updated
    const sorted = (list as any[]).sort(
      (a, b) => (b.time?.updated || 0) - (a.time?.updated || 0)
    );
    activeSessionId = sorted[0].id;
  } else {
    const createRes = await fetch(`${baseUrl}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const session = await createRes.json();
    activeSessionId = session.id;
  }

  return activeSessionId!;
}

// Inject a prompt into OpenCode
// 1. Send message via prompt_async (reliable, works with WebUI)
// 2. Switch WebUI to show the session
async function injectPrompt(prompt: string) {
  const baseUrl = await getBaseUrl();
  console.log("[OpenSider] injectPrompt baseUrl:", baseUrl);

  // Create a new session
  const createRes = await fetch(`${baseUrl}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const session = await createRes.json();
  const sessionId = session.id;
  console.log("[OpenSider] Created session:", sessionId);

  // Send message to the session
  const msgRes = await fetch(`${baseUrl}/session/${sessionId}/prompt_async`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      parts: [{ type: "text", text: prompt }],
    }),
  });
  console.log("[OpenSider] prompt_async response:", msgRes.status);

  // Tell side panel to reload iframe, then switch session after it loads
  chrome.runtime.sendMessage({
    type: "opensider:reload-webui",
    payload: { sessionId },
  }).catch(() => {});
}

// Open side panel when clicking the extension icon
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);

// Context menu for selected text
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "opensider-explain",
    title: "OpenSider: Explain",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: "opensider-translate",
    title: "OpenSider: Translate",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: "opensider-summarize",
    title: "OpenSider: Summarize",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  const action = info.menuItemId.toString().replace("opensider-", "");
  const selectedText = info.selectionText || "";

  // Open side panel
  await chrome.sidePanel.open({ tabId: tab.id });

  // Small delay to ensure side panel is ready
  setTimeout(() => {
    chrome.runtime.sendMessage({
      type: MSG.QUICK_ACTION,
      payload: {
        action,
        text: selectedText,
        context: {
          url: tab.url || "",
          title: tab.title || "",
          selectedText,
        },
      },
    });
  }, 500);
});

// Handle messages from content scripts and side panel
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Ignore messages that aren't ours (other extensions, Chrome internals)
  if (!message || typeof message.type !== "string" || !message.type.startsWith("opensider:")) {
    return false;
  }
  console.log("[OpenSider] Received message:", message.type);
  handleMessage(message, sendResponse);
  return true; // Keep message channel open for async response
});

async function handleMessage(
  message: any,
  sendResponse: (response: any) => void
) {
  try {
    switch (message.type) {
      case MSG.CONNECT: {
        const config = message.payload as ConnectionConfig;
        setConfig(config);
        const connected = await checkConnection();
        // Save config
        await chrome.storage.local.set({ connectionConfig: config });
        sendResponse({ connected });
        break;
      }

      case MSG.CONNECTION_STATUS: {
        const connected = await checkConnection();
        sendResponse({ connected });
        break;
      }

      case MSG.SEND_MESSAGE: {
        const { content, context } = message.payload as {
          content: string;
          context?: PageContext;
        };

        sendMessage(
          content,
          context,
          (text) => {
            // Stream chunk to side panel
            chrome.runtime.sendMessage({
              type: MSG.STREAM_CHUNK,
              payload: { content: text },
            }).catch(() => {});
          },
          (fullText) => {
            chrome.runtime.sendMessage({
              type: MSG.STREAM_DONE,
              payload: { content: fullText },
            }).catch(() => {});
          },
          (error) => {
            chrome.runtime.sendMessage({
              type: MSG.STREAM_ERROR,
              payload: { error },
            }).catch(() => {});
          }
        );

        sendResponse({ ok: true });
        break;
      }

      case MSG.LIST_SESSIONS: {
        const sessions = await listSessions();
        sendResponse({ sessions });
        break;
      }

      case MSG.NEW_SESSION: {
        const sessionId = await createNewSession();
        sendResponse({ sessionId });
        break;
      }

      case MSG.SWITCH_SESSION: {
        switchSession(message.payload.sessionId);
        sendResponse({ ok: true });
        break;
      }

      case MSG.OPEN_SIDEPANEL: {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (tab?.id) {
          await chrome.sidePanel.open({ tabId: tab.id });
        }
        sendResponse({ ok: true });
        break;
      }

      case MSG.AUTO_START: {
        const port = message.payload?.port || 4096;
        const cors = `chrome-extension://${chrome.runtime.id}`;
        const result = await autoStartServer(port, cors);

        if (result.success) {
          const baseUrl = `http://localhost:${result.port}`;
          setConfig({ baseUrl });
          await chrome.storage.local.set({
            connectionConfig: { baseUrl, autoStart: true, port: result.port },
          });
        }

        sendResponse(result);
        break;
      }

      case MSG.SERVER_STATUS: {
        try {
          const status = await getServerStatus();
          sendResponse(status);
        } catch {
          sendResponse({ running: false, managed: false, port: 4096 });
        }
        break;
      }

      case MSG.INJECT_PROMPT: {
        const { prompt } = message.payload as { prompt: string };
        await injectPrompt(prompt);
        sendResponse({ ok: true });
        break;
      }

      case MSG.QUICK_ACTION: {
        const { action, text, context } = message.payload as {
          action: string;
          text: string;
          context: { url: string; title: string; selectedText?: string };
        };

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
        await injectPrompt(prompt);
        sendResponse({ ok: true });
        break;
      }

      case "opensider:select-session": {
        const baseUrl = await getBaseUrl();
        const sid = message.payload?.sessionId;
        if (sid) {
          await fetch(`${baseUrl}/tui/select-session`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionID: sid }),
          });
          console.log("[OpenSider] select-session via SW:", sid);
        }
        sendResponse({ ok: true });
        break;
      }

      default:
        sendResponse({ error: "Unknown message type" });
    }
  } catch (err: any) {
    sendResponse({ error: err.message });
  }
}

// Restore config on startup and auto-start if configured
chrome.storage.local.get("connectionConfig", async (result) => {
  const config = result.connectionConfig as ConnectionConfig | undefined;
  if (config) {
    setConfig(config);

    // Auto-start server if previously configured
    if (config.autoStart) {
      const port = config.port || 4096;
      const cors = `chrome-extension://${chrome.runtime.id}`;
      try {
        await autoStartServer(port, cors);
      } catch {
        // Native host not installed, silently ignore
      }
    }
  }

  // Initialize tab-to-file sync
  initTabSync();
});
