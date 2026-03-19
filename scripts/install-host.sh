#!/bin/bash
# Install OpenSider Native Messaging Host
# Usage: ./scripts/install-host.sh [extension-id]

set -e

HOST_NAME="com.opensider.host"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
HOST_SCRIPT="$PROJECT_DIR/native-host/host.js"

# Make host script executable
chmod +x "$HOST_SCRIPT"

# Determine extension ID
EXTENSION_ID="${1:-}"
if [ -z "$EXTENSION_ID" ]; then
  echo "Usage: $0 <extension-id>"
  echo ""
  echo "Find your extension ID at chrome://extensions/ (enable Developer mode)"
  echo "Example: $0 abcdefghijklmnopqrstuvwxyz123456"
  exit 1
fi

# Determine Chrome native messaging hosts directory
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS - support both Chrome and Chrome Canary
  CHROME_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
  CHROMIUM_DIR="$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
elif [[ "$OSTYPE" == "linux"* ]]; then
  CHROME_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
  CHROMIUM_DIR="$HOME/.config/chromium/NativeMessagingHosts"
else
  echo "Unsupported OS: $OSTYPE"
  echo "Only macOS and Linux are supported."
  exit 1
fi

# Find node path
NODE_PATH=$(which node 2>/dev/null || echo "")
if [ -z "$NODE_PATH" ]; then
  echo "Error: node not found. Please install Node.js first."
  exit 1
fi

# Create the native messaging host manifest
create_manifest() {
  local target_dir="$1"
  mkdir -p "$target_dir"

  cat > "$target_dir/$HOST_NAME.json" << MANIFEST
{
  "name": "$HOST_NAME",
  "description": "OpenSider Native Messaging Host - manages local OpenCode server",
  "path": "$HOST_SCRIPT",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
MANIFEST

  echo "  Installed: $target_dir/$HOST_NAME.json"
}

echo "Installing OpenSider Native Messaging Host..."
echo "  Host script: $HOST_SCRIPT"
echo "  Extension ID: $EXTENSION_ID"
echo ""

# Install for Chrome
if [ -d "$(dirname "$CHROME_DIR")" ]; then
  create_manifest "$CHROME_DIR"
fi

# Install for Chromium
if [ -d "$(dirname "$CHROMIUM_DIR")" ]; then
  create_manifest "$CHROMIUM_DIR"
fi

echo ""
echo "Done! Restart Chrome for changes to take effect."
echo ""
echo "To uninstall later, run:"
echo "  rm \"$CHROME_DIR/$HOST_NAME.json\""
