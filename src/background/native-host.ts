const HOST_NAME = "com.opensider.host";

let port: chrome.runtime.Port | null = null;
let pendingResolvers: Array<(msg: any) => void> = [];

function ensurePort(): chrome.runtime.Port {
  if (port) return port;

  port = chrome.runtime.connectNative(HOST_NAME);

  port.onMessage.addListener((msg: any) => {
    // Resolve the oldest pending request
    if (pendingResolvers.length > 0) {
      const resolve = pendingResolvers.shift()!;
      resolve(msg);
    }

    // Broadcast server status changes to UI
    if (msg.type === "started" || msg.type === "stopped" || msg.type === "error") {
      chrome.runtime.sendMessage({
        type: "opensider:server-status",
        payload: msg,
      }).catch(() => {});
    }
  });

  port.onDisconnect.addListener(() => {
    const error = chrome.runtime.lastError?.message || "Native host disconnected";
    // Reject all pending
    for (const resolve of pendingResolvers) {
      resolve({ type: "error", error });
    }
    pendingResolvers = [];
    port = null;
  });

  return port;
}

function sendToHost(msg: any): Promise<any> {
  return new Promise((resolve) => {
    try {
      const p = ensurePort();
      pendingResolvers.push(resolve);
      p.postMessage(msg);
    } catch (err: any) {
      resolve({ type: "error", error: err.message || "Failed to connect to native host" });
    }
  });
}

export async function autoStartServer(
  serverPort: number,
  cors: string
): Promise<{ success: boolean; port: number; error?: string }> {
  const result = await sendToHost({
    command: "start",
    port: serverPort,
    cors,
  });

  if (result.type === "started") {
    return { success: true, port: result.port || serverPort };
  }
  return { success: false, port: serverPort, error: result.error || result.message };
}

export async function stopServer(): Promise<void> {
  await sendToHost({ command: "stop" });
}

export async function getServerStatus(): Promise<{
  running: boolean;
  managed: boolean;
  port: number;
}> {
  const result = await sendToHost({ command: "status" });
  return {
    running: result.running || false,
    managed: result.managed || false,
    port: result.port || 4096,
  };
}

export function isNativeHostAvailable(): boolean {
  try {
    ensurePort();
    return true;
  } catch {
    return false;
  }
}

export function disconnectHost() {
  if (port) {
    port.disconnect();
    port = null;
  }
}
