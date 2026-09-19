# BrowserClaw Setup & Onboarding Guide

This document is the authoritative onboarding guide for **AI Agents** (Claude Code, Cursor, Windsurf, Codex, Hermes, etc.) and human developers setting up BrowserClaw.

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

- Extension: `browserclaw-extension-latest.zip` (unzip to a persistent local folder).
- Skill: `browserclaw-skill-latest.zip`.

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

## Step 5: Configure Your AI Agent (MCP Client Setup)

Add BrowserClaw to your agent client's MCP configuration:

### 5.1 Cursor (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "browserclaw": {
      "command": "node",
      "args": ["<repo-root>/app/native-server/dist/cli.js", "--stdio"],
      "env": {
        "CHROME_MCP_TOOL_PROFILE": "core"
      }
    }
  }
}
```

### 5.2 Claude Desktop & Claude Code (`~/.claude/claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "browserclaw": {
      "command": "node",
      "args": ["<repo-root>/app/native-server/dist/cli.js", "--stdio"],
      "env": {
        "CHROME_MCP_TOOL_PROFILE": "core"
      }
    }
  }
}
```

### 5.3 Windsurf / Cascade (`~/.codeium/windsurf/mcp_config.json`)

```json
{
  "mcpServers": {
    "browserclaw": {
      "command": "node",
      "args": ["<repo-root>/app/native-server/dist/cli.js", "--stdio"],
      "env": {
        "CHROME_MCP_TOOL_PROFILE": "core"
      }
    }
  }
}
```

### 5.4 Hermes Agent

#### Option A: Native Plugin (Recommended — installs 15 core tools + skill together)

```bash
hermes plugins install GoldenLoaf24h/browserclaw --subdir plugins/browserclaw
hermes plugins enable browserclaw
```

#### Option B: MCP Server Add

```bash
hermes mcp add browserclaw http://127.0.0.1:12306/mcp
```

---

## Step 6: Install the Agent Skill

If your agent supports skill definitions, install the bundled BrowserClaw operator skill:

- **Hermes Agent**: Bundled automatically via the plugin (`skill_view("browserclaw:browserclaw")`).
- **Codex**: Copy `skill/` to `~/.codex/skills/browserclaw/SKILL.md`.
- **Claude Code**: Copy `skill/` to `.claude/skills/browserclaw/SKILL.md`.

---

## Step 7: System Verification & Health Check

Verify that all BrowserClaw components are functioning with the built-in doctor:

```bash
node skill/config/doctor.mjs
```

**Expected Output:**

```text
[PASS] Node.js Environment: v22.x
[PASS] Bridge Token Found: ~/.chrome-mcp/bridge-token
[PASS] Native Bridge Server is Listening (Port 12306)
[PASS] Token Authentication & MCP Initialize OK
[PASS] Extension Build Found
[PASS] Standalone Directory Synced
[PASS] Native Messaging Host Registered in Chrome
STATUS: [HEALTHY] All BrowserClaw layers are operating normally!
```

If any check fails, consult **[docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)** for instant self-healing remedies.
