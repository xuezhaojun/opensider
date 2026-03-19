import { MSG } from "@/shared/types";

const TABS_DIR = ".opensider/tabs";
let tabsBasePath: string | null = null;

// Convert URL to a safe filename
function urlToFilename(url: string): string {
  try {
    const u = new URL(url);
    // Use hostname + pathname, sanitized
    let name = u.hostname + u.pathname;
    // Replace non-alphanumeric chars with hyphens
    name = name.replace(/[^a-zA-Z0-9.-]/g, "-");
    // Collapse multiple hyphens
    name = name.replace(/-+/g, "-");
    // Remove trailing hyphens
    name = name.replace(/-$/, "");
    // Truncate
    if (name.length > 100) name = name.slice(0, 100);
    return name + ".md";
  } catch {
    return "unknown.md";
  }
}

// Send file command to native host
function sendFileCommand(command: string, payload: any): Promise<any> {
  return new Promise((resolve) => {
    try {
      const port = chrome.runtime.connectNative("com.opensider.host");
      port.onMessage.addListener((msg: any) => {
        resolve(msg);
        port.disconnect();
      });
      port.onDisconnect.addListener(() => {
        resolve({ type: "error", error: "disconnected" });
      });
      port.postMessage({ command, ...payload });
    } catch (err: any) {
      resolve({ type: "error", error: err.message });
    }
  });
}

async function getTabsBasePath(): Promise<string> {
  if (tabsBasePath) return tabsBasePath;

  // Get CWD from native host
  const result = await sendFileCommand("get-cwd", {});
  const cwd = result.cwd || "/tmp";
  tabsBasePath = `${cwd}/${TABS_DIR}`;
  return tabsBasePath;
}

// Extract page content from a tab using scripting API
async function extractTabContent(
  tabId: number
): Promise<{ title: string; url: string; markdown: string } | null> {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://")) {
      return null;
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // This runs in the tab's context
        const title = document.title;
        const url = window.location.href;

        // Simple content extraction (Turndown is in content script, not here)
        const contentEl =
          document.querySelector("article") ||
          document.querySelector("main") ||
          document.querySelector('[role="main"]') ||
          document.body;

        const text = (contentEl as HTMLElement)?.innerText || "";
        return { title, url, text: text.slice(0, 8000) };
      },
    });

    if (results && results[0]?.result) {
      const { title, url, text } = results[0].result;
      const markdown = `# ${title}\n\nSource: ${url}\n\n${text}`;
      return { title, url, markdown };
    }
  } catch {
    // Tab might not be accessible (e.g., chrome:// pages)
  }
  return null;
}

// Write tab content to file
async function syncTabToFile(tabId: number) {
  const content = await extractTabContent(tabId);
  if (!content) return;

  const basePath = await getTabsBasePath();
  const filename = urlToFilename(content.url);
  const filePath = `${basePath}/${filename}`;

  await sendFileCommand("write-file", {
    path: filePath,
    content: content.markdown,
  });
}

// Remove tab file
async function removeTabFile(tabId: number, url?: string) {
  if (!url) return;
  const basePath = await getTabsBasePath();
  const filename = urlToFilename(url);
  const filePath = `${basePath}/${filename}`;

  await sendFileCommand("delete-file", { path: filePath });
}

// Track tab URLs for cleanup on close
const tabUrls = new Map<number, string>();

// Sync all current tabs
async function syncAllTabs() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id && tab.url) {
      tabUrls.set(tab.id, tab.url);
      await syncTabToFile(tab.id);
    }
  }
}

// Clean up tabs directory (remove files for tabs that no longer exist)
async function cleanupStaleFiles() {
  const basePath = await getTabsBasePath();
  const result = await sendFileCommand("list-files", { path: basePath });
  if (result.type !== "file-list") return;

  const tabs = await chrome.tabs.query({});
  const activeFilenames = new Set(
    tabs
      .filter((t) => t.url)
      .map((t) => urlToFilename(t.url!))
  );

  for (const file of result.files) {
    if (file.endsWith(".md") && !activeFilenames.has(file)) {
      await sendFileCommand("delete-file", { path: `${basePath}/${file}` });
    }
  }
}

// Initialize tab sync
export function initTabSync() {
  // Sync all tabs on startup
  syncAllTabs().catch(() => {});

  // Tab created
  chrome.tabs.onCreated.addListener((tab) => {
    if (tab.id && tab.url) {
      tabUrls.set(tab.id, tab.url);
    }
  });

  // Tab updated (URL change or page load complete)
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && tab.url) {
      const oldUrl = tabUrls.get(tabId);
      // If URL changed, remove old file
      if (oldUrl && oldUrl !== tab.url) {
        removeTabFile(tabId, oldUrl).catch(() => {});
      }
      tabUrls.set(tabId, tab.url);
      syncTabToFile(tabId).catch(() => {});
    }
  });

  // Tab closed
  chrome.tabs.onRemoved.addListener((tabId) => {
    const url = tabUrls.get(tabId);
    if (url) {
      removeTabFile(tabId, url).catch(() => {});
      tabUrls.delete(tabId);
    }
  });

  // Periodic cleanup of stale files (every 5 minutes)
  chrome.alarms.create("opensider-tab-cleanup", { periodInMinutes: 5 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "opensider-tab-cleanup") {
      cleanupStaleFiles().catch(() => {});
    }
  });
}
