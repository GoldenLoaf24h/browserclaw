# BrowserClaw Setup & Onboarding Guide

This document is the authoritative onboarding guide for **AI Agents** (ChatGPT / Codex, Hermes, Claude Code, Cursor, Windsurf, and other MCP-capable clients) and human developers setting up BrowserClaw.

> **Enjoying BrowserClaw?** If this project saves you time, please consider giving it a star on GitHub — it helps the project grow and keeps improvements coming: https://github.com/GoldenLoaf24h/browserclaw

---

## 0. Prerequisites & System Preflight

Before beginning installation, verify the following system requirements:

- **Node.js**: Version >= 20.0.0 (`node -v`).
- **Package Manager**: `pnpm` recommended. If not installed, run:
  ```bash
  npm install -g pnpm
  ```
- **Supported Browser**: Google Chrome (recommended), Microsoft Edge, Brave, or Opera.

---

## Step 1: Workspace & Build

Choose the installation route matching your current environment:

### Route A: Already Inside Workspace Root

If this repository is already cloned into your current working directory:

```bash
pnpm install
pnpm build
```

### Route B: Fresh Clone from Scratch

If starting from an empty workspace:

```bash
git clone https://github.com/GoldenLoaf24h/browserclaw.git
cd browserclaw
pnpm install
pnpm build
```

### Route C: Zero-Compile Prebuilt Release

If you prefer not to build from source, download the pre-compiled packages directly from [GitHub Releases](https://github.com/GoldenLoaf24h/browserclaw/releases/latest):

- Extension: `browserclaw-extension-v*.zip` (unzip to a persistent local folder).
- Skill: `browserclaw-skill-v*.zip`.

---

## Step 2: Register Native Messaging Host (One-Time OS Binding)

Register BrowserClaw's Native Messaging manifest with your local operating system:

```bash
cd app/native-server
node dist/scripts/register-dev.js
```

**What this does:**

- **Windows**: Registers `com.chromemcp.nativehost` in the Registry under `HKCU\Software\Google\Chrome\NativeMessagingHosts`.
- **macOS**: Places the manifest JSON under `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`.
- **Linux**: Places the manifest JSON under `~/.config/google-chrome/NativeMessagingHosts/`.
- **Security Token**: Automatically generates a high-entropy authentication token at `~/.chrome-mcp/bridge-token` (Windows: `%USERPROFILE%\.chrome-mcp\bridge-token`).

---

## Step 3: Load the Extension into Chrome / Edge

Prompt the user with the following clear instruction:

1. Open `chrome://extensions` (or `edge://extensions`) in your browser.
2. Enable **Developer mode** via the toggle in the top-right corner.
3. Click **Load unpacked** (or drag & drop the folder into the window) and select:
   ```text
   <repo-root>/app/chrome-extension/.output/chrome-mv3
   ```
   _(Or the extracted folder if using prebuilt release)_.
4. Confirm that **BrowserClaw** appears in your extensions list with status enabled.

---

## Step 4: Silent Debugger Mode (Zero-Jitter UX Optimization)

Chrome displays a native top notification bar (_"BrowserClaw is debugging this browser"_) whenever CDP is active. This can cause minor page height jitter during automation.

Ask the user:

> _"Would you like me to enable Chromium Silent Debugger Mode? This adds `--silent-debugger-extension-api` to your Chrome shortcut to permanently hide the top debugging bar for zero page jitter."_

If the user agrees:

### Windows (Automated PowerShell Script)

Run this script to locate and append the flag to the user's Desktop Chrome shortcut:

```powershell
$wsh = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop "Google Chrome.lnk"
if (Test-Path $shortcutPath) {
    $shortcut = $wsh.CreateShortcut($shortcutPath)
    if ($shortcut.Arguments -notmatch "--silent-debugger-extension-api") {
        $shortcut.Arguments = "$($shortcut.Arguments) --silent-debugger-extension-api".Trim()
        $shortcut.Save()
        Write-Host "Chrome shortcut updated with --silent-debugger-extension-api"
    } else {
        Write-Host "Silent debugger flag already present on shortcut."
    }
} else {
    Write-Host "Chrome desktop shortcut not found at $shortcutPath"
}
```

### macOS

Launch Chrome from terminal or update the application launch args:

```bash
open -a "Google Chrome" --args --silent-debugger-extension-api
```

---

## Step 5: Enable Jev Semantic Engine (Recommended for Speed)

BrowserClaw's on-page autonomy (`chrome_act_toward_goal`) runs on **Jev**, a fast semantic decision model from TypeSafe. Without an API key it still works, but falls back to the slower heuristic engine with reduced step budgets — page interactions feel noticeably less snappy (roughly 2-5x slower per decision step).

To unlock full-speed Jev:

1. Get a free API key: register at https://typesafe.ai/blog/introducing-system-one-models-and-jev
2. Set the environment variable before starting your agent / the native bridge:

**Windows (PowerShell, persistent for current user):**

```powershell
[Environment]::SetEnvironmentVariable("TYPESAFE_API_KEY", "your-key-here", "User")
$env:TYPESAFE_API_KEY = "your-key-here"   # makes it available in the current session immediately
```

**macOS / Linux (bash/zsh):**

```bash
export TYPESAFE_API_KEY="your-key-here"
# To persist, add the line above to ~/.bashrc or ~/.zshrc
```

3. Restart your agent client (or the native bridge if running standalone) so it picks up the variable.

> No key, or invalid key? BrowserClaw automatically degrades to the deterministic heuristic engine — nothing breaks, decisions are just slower and more conservative.

---

## Step 6: Connect to Your AI Agent (Plugin vs. Manual MCP)

BrowserClaw supports two connection modes:

- **Mode A (Recommended): Zero-Config Plugin**: If your agent platform (Codex Desktop, Hermes) supports native plugins, install the plugin once and tools are auto-discovered without touching JSON/TOML files.
- **Mode B: Manual MCP Server**: For Cursor, Claude Desktop, Windsurf, or custom agent setups.

---

### Mode A: Zero-Config Plugin (Codex Desktop & Hermes)

#### 1. Codex Desktop App

If installing as a Codex Plugin:

1. Add the BrowserClaw plugin via the Codex Marketplace or your plugin directory.
2. **Critical: Start a New Thread / Task**: Codex injects MCP tool declarations only when a new task initializes. Always open a fresh conversation after installing or updating the plugin.
3. Once the new thread starts, all `chrome_*` tools (such as `chrome_navigate`, `chrome_read_dom`, `chrome_interact_index`) are directly callable out-of-the-box.

#### 2. Hermes Agent

```bash
hermes plugins install GoldenLoaf24h/browserclaw#plugins/browserclaw
hermes plugins enable browserclaw
```

---

### Mode B: Manual MCP Server Configuration

Add BrowserClaw to your agent client's MCP configuration:

Config file locations by operating system:

- **Windows**: `%APPDATA%\\<Client>\\<config>.json`
- **macOS**: `~/Library/Application Support/<Client>/<config>.json`
- **Linux**: `~/.config/<Client>/<config>.json`

---

### 6.1 Cursor (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "browserclaw": {
      "command": "node",
      "args": ["<repo-root>/app/native-server/dist/mcp/mcp-server-stdio.js"],
      "env": {
        "CHROME_MCP_TOOL_PROFILE": "core"
      }
    }
  }
}
```

### 6.2 Claude Desktop & Claude Code (`claude_desktop_config.json`)

Config path: Windows `%APPDATA%\Claude\claude_desktop_config.json`, macOS `~/Library/Application Support/Claude/claude_desktop_config.json`, Linux `~/.config/Claude/claude_desktop_config.json`.

```json
{
  "mcpServers": {
    "browserclaw": {
      "command": "node",
      "args": ["<repo-root>/app/native-server/dist/mcp/mcp-server-stdio.js"],
      "env": {
        "CHROME_MCP_TOOL_PROFILE": "core"
      }
    }
  }
}
```

### 6.3 Windsurf / Cascade (`~/.codeium/windsurf/mcp_config.json`)

```json
{
  "mcpServers": {
    "browserclaw": {
      "command": "node",
      "args": ["<repo-root>/app/native-server/dist/mcp/mcp-server-stdio.js"],
      "env": {
        "CHROME_MCP_TOOL_PROFILE": "core"
      }
    }
  }
}
```

### 6.4 Codex Desktop & CLI (Manual Mode)

If you prefer manual configuration over the native plugin, add a stdio server entry directly to `~/.codex/config.toml` (Windows: `%USERPROFILE%\.codex\config.toml`):

```toml
[mcp_servers.browserclaw]
command = "node"
args = ["<repo-root>/app/native-server/dist/mcp/mcp-server-stdio.js"]
startup_timeout_sec = 60

[mcp_servers.browserclaw.env]
CHROME_MCP_TOOL_PROFILE = "full"
```

> **Note**: After modifying `config.toml`, start a **New Task / Thread** in Codex Desktop to load the tools.

#### ChatGPT Desktop App (HTTP Transport)

For clients supporting HTTP Streamable MCP with custom headers:

```json
{
  "mcpServers": {
    "browserclaw": {
      "url": "http://127.0.0.1:12306/mcp",
      "headers": {
        "x-mcp-token": "PASTE_TOKEN_FROM_~/.chrome-mcp/bridge-token"
      }
    }
  }
}
```

### 6.5 Hermes Agent

#### Option A: Native Plugin (Recommended — installs core tools + skill together)

```bash
hermes plugins install GoldenLoaf24h/browserclaw#plugins/browserclaw
hermes plugins enable browserclaw
```

#### Option B: MCP Server Add (HTTP transport — works on Windows / macOS / Linux identically)

```bash
hermes mcp add browserclaw --url http://127.0.0.1:12306/mcp --auth header

When prompted for headers, enter `x-mcp-token: <TOKEN_FROM_~/.chrome-mcp/bridge-token>`.
```

---

## Step 7: Install the Agent Skill

If your agent supports skill definitions, install the bundled BrowserClaw operator skill:

- **Hermes Agent**: Bundled automatically via the plugin (`skill_view("browserclaw:browserclaw")`).
- **ChatGPT / Codex (desktop app)**: Copy the `skill/` folder to `~/.codex/skills/browserclaw/`.
- **Claude Code**: Copy the `skill/` folder to `.claude/skills/browserclaw/`.
- **Any other MCP-capable agent**: Copy the `skill/` folder into that client's designated skills directory (check its docs for the exact path).

---

## Step 8: System Verification & Health Check

Verify that all BrowserClaw components are functioning with the built-in doctor:

```bash
node skill/config/doctor.mjs
```

**Expected Output:**

```text
[PASS] Node.js Environment: v22.x on win32
[PASS] Bridge Token Found: C:\Users\<user>\.chrome-mcp\bridge-token
[PASS] Native Bridge Server is Listening (Port 12306)
[PASS] Token Authentication & MCP Initialize OK
[PASS] Extension Build Found: D:\workspace\...
[PASS] Standalone Directory Synced: D:\workspace\browserclaw
[PASS] Native Messaging Host Registered in Chrome
----------------------------------------------------------------
Diagnostic Complete: 7 Passed, 0 Failed.
STATUS: [HEALTHY] All BrowserClaw layers are operating normally!
```

If any check fails, consult **[docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)** for instant self-healing remedies.

---

## Support the Project

If BrowserClaw has been useful in your workflow, a GitHub star is the fastest way to support continued development:
https://github.com/GoldenLoaf24h/browserclaw
