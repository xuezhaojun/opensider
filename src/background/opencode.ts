import type { PageContext } from "@/shared/types";

interface OpenCodeConfig {
  baseUrl: string;
  password?: string;
}

let config: OpenCodeConfig = { baseUrl: "http://localhost:4096" };
let currentSessionId: string | null = null;

export function setConfig(c: OpenCodeConfig) {
  config = c;
  currentSessionId = null;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (config.password) {
    const encoded = btoa(`opencode:${config.password}`);
    h["Authorization"] = `Basic ${encoded}`;
  }
  return h;
}

async function api(path: string, options?: RequestInit) {
  const res = await fetch(`${config.baseUrl}${path}`, {
    ...options,
    headers: { ...headers(), ...options?.headers },
  });
  if (!res.ok) {
    throw new Error(`OpenCode API error: ${res.status} ${res.statusText}`);
  }
  return res;
}

export async function checkConnection(): Promise<boolean> {
  try {
    await api("/session");
    return true;
  } catch {
    return false;
  }
}

export async function listSessions() {
  const res = await api("/session");
  return res.json();
}

async function ensureSession(): Promise<string> {
  if (currentSessionId) return currentSessionId;

  const res = await api("/session");
  const data = await res.json();
  const sessions = Object.values(data) as any[];

  if (sessions.length > 0) {
    const sorted = sessions.sort(
      (a: any, b: any) =>
        new Date(b.updatedAt || b.createdAt).getTime() -
        new Date(a.updatedAt || a.createdAt).getTime()
    );
    currentSessionId = sorted[0].id;
    return currentSessionId!;
  }

  const createRes = await api("/session", { method: "POST" });
  const session = await createRes.json();
  currentSessionId = session.id;
  return currentSessionId!;
}

export async function createNewSession(): Promise<string> {
  const createRes = await api("/session", { method: "POST" });
  const session = await createRes.json();
  currentSessionId = session.id;
  return currentSessionId!;
}

export function switchSession(sessionId: string) {
  currentSessionId = sessionId;
}

function buildPrompt(content: string, context?: PageContext): string {
  if (!context) return content;

  const parts: string[] = [];

  parts.push(`[Page: ${context.title}](${context.url})`);

  if (context.selectedText) {
    // Prefix each line with > for proper blockquote
    const quoted = context.selectedText
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
    parts.push(`\nSelected text:\n${quoted}`);
  }

  if (context.bodyMarkdown && !context.selectedText) {
    parts.push(`\nPage content:\n${context.bodyMarkdown}`);
  }

  parts.push(`\n${content}`);

  return parts.join("\n");
}

// Parse SSE text stream into events
function parseSSELines(
  text: string,
  onEvent: (data: string) => void
): string {
  // Returns any incomplete trailing text
  const lines = text.split("\n");
  let remainder = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // If this is the last line and doesn't end with \n, it's incomplete
    if (i === lines.length - 1 && !text.endsWith("\n")) {
      remainder = line;
      break;
    }

    if (line.startsWith("data: ")) {
      onEvent(line.slice(6));
    }
  }

  return remainder;
}

export async function sendMessage(
  content: string,
  context: PageContext | undefined,
  onChunk: (text: string) => void,
  onDone: (fullText: string) => void,
  onError: (error: string) => void
) {
  try {
    const sessionId = await ensureSession();
    const prompt = buildPrompt(content, context);

    // Subscribe to SSE events FIRST using fetch (works in Service Worker)
    const abortController = new AbortController();
    const eventPromise = consumeSSEStream(
      sessionId,
      abortController,
      onChunk,
      onDone,
      onError
    );

    // Then send the message using prompt_async (non-blocking)
    try {
      await api(`/session/${sessionId}/prompt_async`, {
        method: "POST",
        body: JSON.stringify({
          parts: [{ type: "text", text: prompt }],
        }),
      });
    } catch (err: any) {
      abortController.abort();
      onError(err.message || "Failed to send message");
      return;
    }

    // Wait for streaming to complete
    await eventPromise;
  } catch (err: any) {
    onError(err.message || "Failed to send message");
  }
}

async function consumeSSEStream(
  sessionId: string,
  abortController: AbortController,
  onChunk: (text: string) => void,
  onDone: (fullText: string) => void,
  onError: (error: string) => void
) {
  let fullText = "";

  try {
    const res = await fetch(`${config.baseUrl}/event`, {
      headers: headers(),
      signal: abortController.signal,
    });

    if (!res.ok || !res.body) {
      // Fallback to polling
      await pollForResponse(sessionId, onChunk, onDone, onError);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events from buffer
      buffer = parseSSELines(buffer, (data) => {
        try {
          const parsed = JSON.parse(data);
          const props = parsed.properties;

          // Stream text deltas
          if (parsed.type === "message.part.delta" && props?.delta) {
            if (props.field === "content" || props.field === "text") {
              fullText += props.delta;
              onChunk(fullText);
            }
          }

          // Session idle = response complete
          if (parsed.type === "session.idle") {
            abortController.abort();
            onDone(fullText);
          }

          // Message updated (may contain complete text)
          if (parsed.type === "message.updated" && props?.info?.role === "assistant") {
            // Don't override streaming text unless we haven't received any
          }

          if (parsed.type === "error") {
            abortController.abort();
            onError(props?.message || "Unknown error");
          }
        } catch {
          // Ignore non-JSON events
        }
      });
    }

    // Stream ended without explicit completion
    if (fullText) {
      onDone(fullText);
    }
  } catch (err: any) {
    if (err.name === "AbortError") return;

    // Fallback to polling if SSE fails
    if (fullText) {
      onDone(fullText);
    } else {
      await pollForResponse(sessionId, onChunk, onDone, onError);
    }
  }
}

// Fallback polling if SSE doesn't work
async function pollForResponse(
  sessionId: string,
  onChunk: (text: string) => void,
  onDone: (fullText: string) => void,
  onError: (error: string) => void
) {
  const maxAttempts = 60;
  let attempts = 0;

  const poll = async () => {
    try {
      const res = await api(`/session/${sessionId}/message`);
      const messages = await res.json();
      const msgArray = Array.isArray(messages)
        ? messages
        : Object.values(messages);
      const assistantMsgs = (msgArray as any[]).filter(
        (m: any) => m.role === "assistant"
      );

      if (assistantMsgs.length > 0) {
        const latest = assistantMsgs[assistantMsgs.length - 1];
        const content =
          latest.content ||
          (latest.parts || [])
            .map((p: any) => p.content || p.text || "")
            .join("");

        if (content) {
          onChunk(content);
          onDone(content);
          return;
        }
      }

      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(poll, 1000);
      } else {
        onError("Response timeout");
      }
    } catch (err: any) {
      onError(err.message);
    }
  };

  setTimeout(poll, 500);
}
