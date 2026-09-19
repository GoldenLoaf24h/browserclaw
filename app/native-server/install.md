# BrowserClaw Native Bridge Installation Guide

The native server bridges Chrome Native Messaging (stdio) and AI Agent MCP clients (HTTP/SSE on port 12306 or stdio).

For the complete, step-by-step onboarding guide across the full BrowserClaw stack, see the root **[INSTALL.md](../../INSTALL.md)**.

---

## Quick Setup

### 1. Build Native Bridge

From the repository root:
`ash
pnpm --filter mcp-chrome-bridge build
`

### 2. Register Native Messaging Host

Register the host manifest with Chromium so Chrome can spawn the bridge process:

`ash
cd app/native-server
node dist/scripts/register-dev.js
`

- **Windows**: Writes registry key at HKCU\Software\Google\Chrome\NativeMessagingHosts\com.chromemcp.nativehost.
- **macOS**: Writes manifest to ~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.chromemcp.nativehost.json.
- **Linux**: Writes manifest to ~/.config/google-chrome/NativeMessagingHosts/com.chromemcp.nativehost.json.

### 3. Verify Health

Run the built-in diagnostic suite:

`ash
node dist/scripts/doctor.js
`

Or from repository root:
`ash
node skill/config/doctor.mjs
`
