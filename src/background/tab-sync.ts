import { writeFile, deleteFile, listFiles, getCwd } from "./native-host";

const TABS_DIR = ".opensider/tabs";
let tabsBasePath: string | null = null;

// Convert URL to a safe filename
function urlToFilename(url: string): string {
  try {
    const u = new URL(url);
    let name = u.hostname + u.pathname;
    name = name.replace(/[^a-zA-Z0-9.-]/g, "-");
    name = name.replace(/-+/g, "-");
    name = name.replace(/-$/, "");
    if (name.length > 100) name = name.slice(0, 100);
    return name + ".md";
  } catch {
    return "unknown.md";
  }
}

async function getTabsBasePath(): Promise<string> {
  if (tabsBasePath) return tabsBasePath;
  const cwd = await getCwd();
  tabsBasePath = `${cwd}/${TABS_DIR}`;
  return tabsBasePath;
}

// Skip non-content URLs
function shouldSync(url: string | undefined): boolean {
  if (!url) return false;
  return (
    url.startsWith("http://") ||
    url.startsWith("https://")
  );
}

// Extract page content from a tab
async function extractTabContent(
  tabId: number
): Promise<{ title: string; url: string; markdown: string } | null> {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!shouldSync(tab.url)) return null;

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const title = document.title;
        const url = window.location.href;
        const contentEl =
          document.querySelector("article") ||
          document.querySelector("main") ||
          document.querySelector('[role="main"]') ||
          document.body;
        const text = (contentEl as HTMLElement)?.innerText || "";
        return { title, url, text: text.slice(0, 8000) };
      },
    });

    if (results?.[0]?.result) {
      const { title, url, text } = results[0].result;
      const markdown = `# ${title}\n\nSource: ${url}\n\n${text}`;
      return { title, url, markdown };
    }
  } catch {
    // Tab not accessible
  }
  return null;
}

// Write tab content to file
async function syncTabToFile(tabId: number) {
  const content = await extractTabContent(tabId);
  if (!content) return;

  const basePath = await getTabsBasePath();
  const filename = urlToFilename(content.url);
  await writeFile(`${basePath}/${filename}`, content.markdown);
}

// Remove tab file
async function removeTabFile(url: string) {
  const basePath = await getTabsBasePath();
  const filename = urlToFilename(url);
  await deleteFile(`${basePath}/${filename}`);
}

// Track tab URLs
const tabUrls = new Map<number, string>();

// Sync all current tabs
async function syncAllTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id && shouldSync(tab.url)) {
        tabUrls.set(tab.id, tab.url!);
        await syncTabToFile(tab.id);
      }
    }
  } catch {
    // Silently fail if native host not available
  }
}

// Clean up stale files
async function cleanupStaleFiles() {
  try {
    const basePath = await getTabsBasePath();
    const files = await listFiles(basePath);

    const tabs = await chrome.tabs.query({});
    const activeFilenames = new Set(
      tabs.filter((t) => shouldSync(t.url)).map((t) => urlToFilename(t.url!))
    );

    for (const file of files) {
      if (file.endsWith(".md") && !activeFilenames.has(file)) {
        await deleteFile(`${basePath}/${file}`);
      }
    }
  } catch {
    // Silently fail
  }
}

export function initTabSync() {
  // Delay initial sync to let native host connect first
  setTimeout(() => syncAllTabs(), 3000);

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && shouldSync(tab.url)) {
      const oldUrl = tabUrls.get(tabId);
      if (oldUrl && oldUrl !== tab.url) {
        removeTabFile(oldUrl).catch(() => {});
      }
      tabUrls.set(tabId, tab.url!);
      syncTabToFile(tabId).catch(() => {});
    }
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    const url = tabUrls.get(tabId);
    if (url) {
      removeTabFile(url).catch(() => {});
      tabUrls.delete(tabId);
    }
  });

  chrome.alarms.create("opensider-tab-cleanup", { periodInMinutes: 5 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "opensider-tab-cleanup") {
      cleanupStaleFiles().catch(() => {});
    }
  });
}
