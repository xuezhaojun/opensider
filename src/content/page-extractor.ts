import type { PageContext } from "@/shared/types";

export function extractPageContext(selectedText?: string): PageContext {
  const title = document.title || "";
  const url = window.location.href;

  // Extract a snippet of the main content
  let bodySnippet = "";
  // Try common article containers first
  const article = (
    document.querySelector("article") ||
    document.querySelector("main") ||
    document.querySelector('[role="main"]') ||
    document.querySelector(".content") ||
    document.querySelector("#content")
  ) as HTMLElement | null;

  if (article) {
    bodySnippet = article.innerText.slice(0, 3000);
  } else {
    bodySnippet = document.body.innerText.slice(0, 3000);
  }

  return {
    url,
    title,
    selectedText: selectedText || undefined,
    bodySnippet,
  };
}
