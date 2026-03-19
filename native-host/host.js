#!/usr/bin/env node

// OpenSider Native Messaging Host
// Manages the local OpenCode server lifecycle for the Chrome extension.
//
// Protocol: Chrome Native Messaging (length-prefixed JSON over stdin/stdout)
// Commands: start, stop, status

const { spawn, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

let opencodeProcess = null;
let serverPort = 4096;
let serverReady = false;

// --- Native Messaging Protocol ---

function sendMessage(msg) {
  const json = JSON.stringify(msg);
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(json.length, 0);
  process.stdout.write(buf);
  process.stdout.write(json);
}

function readMessage(callback) {
  let pendingLength = null;
  let chunks = [];
  let totalLength = 0;

  process.stdin.on("data", (chunk) => {
    chunks.push(chunk);
    totalLength += chunk.length;

    while (true) {
      const buf = Buffer.concat(chunks, totalLength);

      if (pendingLength === null) {
        if (buf.length < 4) return;
        pendingLength = buf.readUInt32LE(0);
        const rest = buf.slice(4);
        chunks = rest.length > 0 ? [rest] : [];
        totalLength = rest.length;
      }

      if (pendingLength !== null && totalLength >= pendingLength) {
        const msgBuf = Buffer.concat(chunks, totalLength);
        const jsonStr = msgBuf.slice(0, pendingLength).toString("utf8");
        const rest = msgBuf.slice(pendingLength);
        chunks = rest.length > 0 ? [rest] : [];
        totalLength = rest.length;
        pendingLength = null;

        try {
          callback(JSON.parse(jsonStr));
        } catch (e) {
          sendMessage({ type: "error", error: "Invalid JSON: " + e.message });
        }
      } else {
        break;
      }
    }
  });
}

// --- OpenCode Server Management ---

function findOpenCode() {
  try {
    const which = execSync("which opencode", { encoding: "utf8" }).trim();
    return which;
  } catch {
    // Check common locations
    const locations = [
      path.join(process.env.HOME || "", ".local", "bin", "opencode"),
      "/usr/local/bin/opencode",
      path.join(process.env.HOME || "", "go", "bin", "opencode"),
    ];
    for (const loc of locations) {
      if (fs.existsSync(loc)) return loc;
    }
    return null;
  }
}

function isServerRunning() {
  return opencodeProcess !== null && !opencodeProcess.killed;
}

async function checkServerReachable(port) {
  try {
    const http = require("http");
    return new Promise((resolve) => {
      const req = http.get(`http://localhost:${port}/session`, (res) => {
        resolve(res.statusCode < 500);
      });
      req.on("error", () => resolve(false));
      req.setTimeout(2000, () => {
        req.destroy();
        resolve(false);
      });
    });
  } catch {
    return false;
  }
}

async function startServer(options = {}) {
  const port = options.port || serverPort;
  serverPort = port;
  const corsOrigin = options.cors || "";
  const cwd = options.cwd || process.env.HOME || "/";

  // Check if already running
  if (isServerRunning()) {
    const reachable = await checkServerReachable(port);
    if (reachable) {
      sendMessage({
        type: "started",
        port,
        pid: opencodeProcess.pid,
        message: "Server already running",
      });
      return;
    }
    // Process exists but not responding, kill and restart
    stopServer();
  }

  // Check if server is already running externally
  const externallyRunning = await checkServerReachable(port);
  if (externallyRunning) {
    sendMessage({
      type: "started",
      port,
      pid: null,
      message: "Server already running externally",
    });
    return;
  }

  const opencodePath = findOpenCode();
  if (!opencodePath) {
    sendMessage({
      type: "error",
      error:
        "opencode not found. Install it with: go install github.com/opencode-ai/opencode@latest",
    });
    return;
  }

  const args = ["serve", "--port", String(port)];
  if (corsOrigin) {
    args.push("--cors", corsOrigin);
  }

  serverReady = false;

  opencodeProcess = spawn(opencodePath, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
    env: { ...process.env },
  });

  let stderr = "";

  opencodeProcess.stdout.on("data", (data) => {
    const text = data.toString();
    // Detect server ready
    if (!serverReady && (text.includes("listening") || text.includes("started"))) {
      serverReady = true;
    }
  });

  opencodeProcess.stderr.on("data", (data) => {
    stderr += data.toString();
  });

  opencodeProcess.on("error", (err) => {
    sendMessage({ type: "error", error: "Failed to start: " + err.message });
    opencodeProcess = null;
  });

  opencodeProcess.on("exit", (code) => {
    const msg =
      code === 0
        ? "Server stopped"
        : `Server exited with code ${code}. ${stderr.slice(-500)}`;
    sendMessage({ type: "stopped", code, message: msg });
    opencodeProcess = null;
    serverReady = false;
  });

  // Wait for server to be reachable
  const maxWait = 15000;
  const interval = 300;
  let waited = 0;

  const waitForReady = async () => {
    while (waited < maxWait) {
      if (!opencodeProcess || opencodeProcess.killed) {
        sendMessage({ type: "error", error: "Server process died during startup" });
        return;
      }
      const reachable = await checkServerReachable(port);
      if (reachable) {
        sendMessage({
          type: "started",
          port,
          pid: opencodeProcess.pid,
          message: "Server started successfully",
        });
        return;
      }
      await new Promise((r) => setTimeout(r, interval));
      waited += interval;
    }
    sendMessage({
      type: "error",
      error: "Server did not become reachable within timeout. stderr: " + stderr.slice(-300),
    });
  };

  waitForReady();
}

function stopServer() {
  if (opencodeProcess && !opencodeProcess.killed) {
    const proc = opencodeProcess;
    proc.kill("SIGTERM");
    setTimeout(() => {
      try {
        if (!proc.killed) proc.kill("SIGKILL");
      } catch {
        // Process already exited
      }
    }, 3000);
  }
  opencodeProcess = null;
  serverReady = false;
}

// --- Message Handler ---

readMessage(async (msg) => {
  switch (msg.command) {
    case "start":
      await startServer({
        port: msg.port || 4096,
        cors: msg.cors || "",
        cwd: msg.cwd || "",
      });
      break;

    case "stop":
      stopServer();
      sendMessage({ type: "stopped", message: "Server stopped" });
      break;

    case "status": {
      const running = isServerRunning();
      const reachable = running
        ? await checkServerReachable(serverPort)
        : await checkServerReachable(msg.port || 4096);
      sendMessage({
        type: "status",
        running: running || reachable,
        pid: opencodeProcess?.pid || null,
        port: serverPort,
        managed: running,
      });
      break;
    }

    default:
      sendMessage({ type: "error", error: "Unknown command: " + msg.command });
  }
});

// Cleanup on exit
process.on("SIGTERM", () => {
  stopServer();
  process.exit(0);
});

process.on("SIGINT", () => {
  stopServer();
  process.exit(0);
});

process.stdin.on("end", () => {
  stopServer();
  process.exit(0);
});
