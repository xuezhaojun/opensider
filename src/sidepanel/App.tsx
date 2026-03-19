import { useEffect, useRef, useState } from "react";
import { useChatStore } from "./store/chat";
import { SettingsPanel } from "./components/SettingsPanel";
import { MSG } from "@/shared/types";

type ViewMode = "webui" | "settings";

export default function App() {
  const {
    isConnected,
    setConnected,
    serverUrl,
  } = useChatStore();
  const [viewMode, setViewMode] = useState<ViewMode>("webui");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Listen for inject messages from service worker
  useEffect(() => {
    const handler = (message: any) => {
      if (message.type === "opensider:webui-inject") {
        const { prompt } = message.payload;
        console.log("[OpenSider] Side panel received inject request");
        injectIntoIframe(prompt);
      }
    };

    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  function injectIntoIframe(prompt: string) {
    const iframe = iframeRef.current;
    if (!iframe) {
      console.warn("[OpenSider] No iframe ref");
      return;
    }

    // Send via postMessage to the iframe
    // The WebUI needs to listen for this, or we inject a script
    try {
      iframe.contentWindow?.postMessage(
        { type: "opensider:inject-prompt", prompt },
        "*"
      );
    } catch (err) {
      console.warn("[OpenSider] postMessage failed:", err);
    }

    // Also try direct DOM manipulation (same-origin since both are localhost)
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        fillAndSubmit(doc, prompt);
      }
    } catch (err) {
      console.warn("[OpenSider] Direct DOM access failed (cross-origin?):", err);
    }
  }

  function fillAndSubmit(doc: Document, prompt: string) {
    // Find textarea in the WebUI
    const textarea = (
      doc.querySelector("textarea[placeholder]") ||
      doc.querySelector("textarea") ||
      doc.querySelector('[contenteditable="true"]') ||
      doc.querySelector('[role="textbox"]') ||
      doc.querySelector(".cm-content")
    ) as HTMLElement | null;

    if (!textarea) {
      console.warn("[OpenSider] Could not find input in WebUI");
      return;
    }

    console.log("[OpenSider] Found input element:", textarea.tagName);

    if (textarea instanceof HTMLTextAreaElement) {
      // Use native setter to trigger React's onChange
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype, "value"
      )?.set;
      nativeSetter?.call(textarea, prompt);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));

      // Submit via Enter key after React state updates
      setTimeout(() => {
        textarea.dispatchEvent(new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          bubbles: true,
        }));

        // Also try clicking submit button
        const buttons = doc.querySelectorAll("button");
        for (const btn of buttons) {
          // Look for submit/send icon button (usually has an SVG arrow)
          if (btn.closest("form") || btn.querySelector("svg")) {
            const rect = btn.getBoundingClientRect();
            // Only click buttons that are near the textarea (likely submit)
            const textareaRect = textarea.getBoundingClientRect();
            if (Math.abs(rect.bottom - textareaRect.bottom) < 100) {
              console.log("[OpenSider] Clicking submit button");
              btn.click();
              break;
            }
          }
        }
      }, 300);
    } else {
      // ContentEditable
      textarea.textContent = prompt;
      textarea.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }
  }

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
          ref={iframeRef}
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
