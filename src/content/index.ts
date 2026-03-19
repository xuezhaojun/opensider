import { MSG } from "@/shared/types";
import { extractPageContext } from "./page-extractor";

// ---- Floating Button ----
function createFloatButton() {
  const host = document.createElement("div");
  host.id = "opensider-float-host";
  const shadow = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = `
    .opensider-float {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: #2563eb;
      color: white;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      z-index: 2147483647;
      transition: transform 0.15s, box-shadow 0.15s;
      font-size: 20px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      user-select: none;
    }
    .opensider-float:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 16px rgba(0,0,0,0.3);
    }
    .opensider-float:active {
      transform: scale(0.95);
    }
    .opensider-float.dragging {
      opacity: 0.8;
    }
  `;
  shadow.appendChild(style);

  const btn = document.createElement("button");
  btn.className = "opensider-float";
  btn.textContent = "O";
  btn.title = "OpenSider";

  // Drag support
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let btnStartX = 0;
  let btnStartY = 0;

  btn.addEventListener("mousedown", (e) => {
    isDragging = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    const rect = btn.getBoundingClientRect();
    btnStartX = rect.left;
    btnStartY = rect.top;

    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        isDragging = true;
        btn.classList.add("dragging");
        btn.style.right = "auto";
        btn.style.bottom = "auto";
        btn.style.left = btnStartX + dx + "px";
        btn.style.top = btnStartY + dy + "px";
      }
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      btn.classList.remove("dragging");
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

  btn.addEventListener("click", (e) => {
    if (isDragging) {
      e.preventDefault();
      return;
    }
    chrome.runtime.sendMessage({ type: MSG.OPEN_SIDEPANEL });
  });

  shadow.appendChild(btn);
  document.body.appendChild(host);
}

// ---- Selection Toolbar ----
let toolbarHost: HTMLElement | null = null;
let toolbarShadow: ShadowRoot | null = null;
let toolbarEl: HTMLElement | null = null;

function createToolbarHost() {
  toolbarHost = document.createElement("div");
  toolbarHost.id = "opensider-toolbar-host";
  toolbarShadow = toolbarHost.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = `
    .opensider-toolbar {
      position: fixed;
      display: none;
      align-items: center;
      gap: 1px;
      padding: 3px;
      background: white;
      border: 1px solid #e4e4e7;
      border-radius: 10px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.14), 0 1px 3px rgba(0,0,0,0.08);
      z-index: 2147483646;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .opensider-toolbar.visible {
      display: flex;
    }
    .opensider-logo {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 6px;
      background: #2563eb;
      color: white;
      font-size: 12px;
      font-weight: 700;
      margin: 0 2px;
      flex-shrink: 0;
    }
    .opensider-divider {
      width: 1px;
      height: 16px;
      background: #e4e4e7;
      margin: 0 2px;
    }
    .opensider-toolbar button {
      padding: 5px 8px;
      border: none;
      background: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 500;
      color: #52525b;
      white-space: nowrap;
      transition: all 0.1s;
      line-height: 1;
    }
    .opensider-toolbar button:hover {
      background: #eff6ff;
      color: #2563eb;
    }
    .opensider-toolbar button:active {
      background: #dbeafe;
    }
  `;
  toolbarShadow.appendChild(style);

  toolbarEl = document.createElement("div");
  toolbarEl.className = "opensider-toolbar";

  // Logo
  const logo = document.createElement("span");
  logo.className = "opensider-logo";
  logo.textContent = "O";
  toolbarEl.appendChild(logo);

  // Divider
  const divider = document.createElement("span");
  divider.className = "opensider-divider";
  toolbarEl.appendChild(divider);

  const actions = [
    { id: "explain", label: "Explain" },
    { id: "translate", label: "Translate" },
    { id: "summarize", label: "Summarize" },
    { id: "ask", label: "Ask..." },
  ];

  for (const action of actions) {
    const btn = document.createElement("button");
    btn.textContent = action.label;
    btn.addEventListener("click", () => {
      const selection = window.getSelection()?.toString().trim() || "";
      if (!selection) return;

      const context = extractPageContext(selection);

      chrome.runtime.sendMessage({
        type: MSG.QUICK_ACTION,
        payload: { action: action.id, text: selection, context },
      });
      chrome.runtime.sendMessage({ type: MSG.OPEN_SIDEPANEL });
      hideToolbar();
    });
    toolbarEl.appendChild(btn);
  }

  toolbarShadow.appendChild(toolbarEl);
  document.body.appendChild(toolbarHost);
}

function showToolbar(x: number, y: number) {
  if (!toolbarEl) return;
  toolbarEl.style.left = x + "px";
  toolbarEl.style.top = y + "px";
  toolbarEl.classList.add("visible");
}

function hideToolbar() {
  if (!toolbarEl) return;
  toolbarEl.classList.remove("visible");
}

// ---- Selection Detection ----
function setupSelectionDetection() {
  document.addEventListener("mouseup", (e) => {
    // Ignore clicks inside our own UI
    const target = e.target as HTMLElement;
    if (
      target.closest("#opensider-float-host") ||
      target.closest("#opensider-toolbar-host")
    ) {
      return;
    }

    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();

      if (text && text.length > 2) {
        const range = selection!.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        // Position toolbar above the selection (fixed positioning)
        const x = Math.max(
          8,
          Math.min(rect.left + rect.width / 2 - 100, window.innerWidth - 250)
        );
        const y = Math.max(8, rect.top - 48);

        showToolbar(x, y);
      } else {
        hideToolbar();
      }
    }, 10);
  });

  // Hide on click elsewhere
  document.addEventListener("mousedown", (e) => {
    const target = e.target as HTMLElement;
    if (!target.closest("#opensider-toolbar-host")) {
      hideToolbar();
    }
  });

  // Send page context updates when navigating
  let lastUrl = window.location.href;
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      const context = extractPageContext();
      chrome.runtime.sendMessage({
        type: MSG.PAGE_CONTEXT,
        payload: context,
      }).catch(() => {});
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// ---- Initialize ----
function init() {
  createFloatButton();
  createToolbarHost();
  setupSelectionDetection();

  // Send initial page context
  setTimeout(() => {
    const context = extractPageContext();
    chrome.runtime.sendMessage({
      type: MSG.PAGE_CONTEXT,
      payload: context,
    }).catch(() => {});
  }, 1000);
}

// Guard: only run in document context (not service worker)
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
