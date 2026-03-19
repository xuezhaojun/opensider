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

      default:
        sendResponse({ error: "Unknown message type" });
    }
  } catch (err: any) {
    sendResponse({ error: err.message });
  }
}

// Restore config on startup
chrome.storage.local.get("connectionConfig", (result) => {
  const config = result.connectionConfig as { baseUrl: string; password?: string } | undefined;
  if (config) {
    setConfig(config);
  }
});
