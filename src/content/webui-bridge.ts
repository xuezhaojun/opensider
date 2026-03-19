// This content script runs INSIDE the OpenCode WebUI iframe
// It listens for messages from the extension and manipulates the WebUI DOM

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "opensider:webui-inject") return false;

  const { prompt } = message.payload;
  console.log("[OpenSider WebUI Bridge] Injecting prompt:", prompt.slice(0, 50) + "...");

  try {
    injectIntoWebUI(prompt);
    sendResponse({ ok: true });
  } catch (err: any) {
    console.error("[OpenSider WebUI Bridge] Error:", err);
    sendResponse({ error: err.message });
  }

  return true;
});

function injectIntoWebUI(prompt: string) {
  // Find the textarea/input in the OpenCode WebUI
  // The WebUI likely uses a textarea or contenteditable div for input
  const textarea = findInputElement();
  if (!textarea) {
    console.warn("[OpenSider WebUI Bridge] Could not find input element");
    return;
  }

  // Set the value
  if (textarea instanceof HTMLTextAreaElement || textarea instanceof HTMLInputElement) {
    // For regular input/textarea
    const nativeSetter = Object.getOwnPropertyDescriptor(
      textarea instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value"
    )?.set;
    nativeSetter?.call(textarea, prompt);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
  } else {
    // For contenteditable div
    textarea.textContent = prompt;
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true }));
  }

  // Submit after a short delay to let React state update
  setTimeout(() => {
    submitPrompt(textarea);
  }, 200);
}

function findInputElement(): HTMLElement | null {
  // Try common selectors for the OpenCode WebUI input
  const selectors = [
    'textarea[placeholder]',
    'textarea',
    '[contenteditable="true"]',
    '[role="textbox"]',
    'input[type="text"]',
    '.cm-content', // CodeMirror
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector) as HTMLElement;
    if (el) return el;
  }

  return null;
}

function submitPrompt(inputEl: HTMLElement) {
  // Try pressing Enter (Cmd+Enter or Enter) to submit
  const enterEvent = new KeyboardEvent("keydown", {
    key: "Enter",
    code: "Enter",
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true,
  });
  inputEl.dispatchEvent(enterEvent);

  // Also try finding and clicking a submit button
  const submitBtn = document.querySelector(
    'button[type="submit"], button[aria-label*="send"], button[aria-label*="submit"]'
  ) as HTMLButtonElement | null;

  if (submitBtn) {
    submitBtn.click();
    return;
  }

  // Look for a button near the input that might be submit
  const buttons = document.querySelectorAll("button");
  for (const btn of buttons) {
    const text = btn.textContent?.toLowerCase() || "";
    const ariaLabel = btn.getAttribute("aria-label")?.toLowerCase() || "";
    if (
      text.includes("send") ||
      text.includes("submit") ||
      ariaLabel.includes("send") ||
      ariaLabel.includes("submit")
    ) {
      btn.click();
      return;
    }
  }

  // Try Ctrl+Enter / Cmd+Enter as another submit shortcut
  inputEl.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      ctrlKey: true,
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })
  );
}

console.log("[OpenSider WebUI Bridge] Loaded in:", window.location.href);
