#!/bin/bash
# Launcher for OpenSider native messaging host.
# Chrome GUI apps don't inherit shell PATH, so we need to find node ourselves.

# Source common profile files to get PATH
[ -f "$HOME/.zshrc" ] && source "$HOME/.zshrc" 2>/dev/null
[ -f "$HOME/.bashrc" ] && source "$HOME/.bashrc" 2>/dev/null
[ -f "$HOME/.profile" ] && source "$HOME/.profile" 2>/dev/null

# Add common node locations to PATH
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node/ 2>/dev/null | tail -1)/bin:$PATH"

DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "$DIR/host.cjs"
