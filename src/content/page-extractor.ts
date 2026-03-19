import TurndownService from "turndown";
import type { PageContext } from "@/shared/types";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

// Remove script, style, nav, footer, and other non-content elements
turndown.remove(["script", "style", "nav", "footer", "header", "aside", "iframe", "noscript"]);

export function extractPageContext(selectedText?: string): PageContext {
  const title = document.title || "";
  const url = window.location.href;

  // Extract main content area
  const contentEl = (
    document.querySelector("article") ||
    document.querySelector("main") ||
    document.querySelector('[role="main"]') ||
    document.querySelector(".content") ||
    document.querySelector("#content") ||
    document.body
  ) as HTMLElement;

  // Convert to Markdown using Turndown
  let bodyMarkdown = "";
  try {
    bodyMarkdown = turndown.turndown(contentEl.innerHTML);
    // Truncate to reasonable size for LLM context
    if (bodyMarkdown.length > 5000) {
      bodyMarkdown = bodyMarkdown.slice(0, 5000) + "\n\n[...truncated]";
    }
  } catch {
    bodyMarkdown = contentEl.innerText.slice(0, 3000);
  }

  return {
    url,
    title,
    selectedText: selectedText || undefined,
    bodyMarkdown,
  };
}
