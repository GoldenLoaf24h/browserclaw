# BrowserClaw Agent Setup Guide

This document is an automated onboarding guide for AI Agents (Claude Code, Cursor, Windsurf, Codex, etc.).

---

## Step 1: Environment & Dependency Setup

Run the following commands in the workspace root:

```bash
git clone https://github.com/GoldenLoaf24h/browserclaw.git
cd browserclaw
pnpm install
pnpm build
```

---

## Step 2: Register Native Host & Start MCP Server

Register the native bridge host:

```bash
cd app/native-server
node dist/scripts/register-dev.js
```

- Local endpoint: `http://127.0.0.1:12306/mcp`
- Auth token is automatically generated at: `~/.chrome-mcp/bridge-token`

---

## Step 3: Guide the User to Load the Extension

Prompt the user with the following clear instruction:

1. Download **[browserclaw-extension-latest.zip](https://github.com/GoldenLoaf24h/browserclaw/releases/latest)** (or locate `app/chrome-extension/.output/chrome-mv3` in this workspace).
2. Open `chrome://extensions` in Chrome / Edge.
3. Enable **Developer mode** in the top-right corner.
4. Drag & drop the unpacked folder into the page (or click **Load unpacked** and select it).

---

## Step 4: Proactive Setup — Silent Debugger Mode (Optional)

Ask the user:

> _"Would you like me to enable Chromium Silent Debugger Mode? This adds `--silent-debugger-extension-api` to your Chrome shortcut to permanently hide Chrome's top 'BrowserClaw is debugging this browser' warning bar."_

If the user agrees, locate their Chrome shortcut and append `--silent-debugger-extension-api`.

---

## Step 5: Install Agent Skill (Hermes / Codex / Claude Code)

### Hermes Agent

#### Option A: Native Hermes Plugin (Recommended — installs 15 core tools + bundled skill together)

```bash
hermes plugins install GoldenLoaf24h/browserclaw --subdir plugins/browserclaw
hermes plugins enable browserclaw
```

#### Option B: Standalone Skill only

```bash
hermes skills install "https://raw.githubusercontent.com/GoldenLoaf24h/browserclaw/main/skill/SKILL.md" --name browserclaw
```

Or inside a Hermes interactive session:

```text
/skills install https://raw.githubusercontent.com/GoldenLoaf24h/browserclaw/main/skill/SKILL.md --name browserclaw
```

### Codex / Claude Code / Custom Workspace

Copy `skill/` (or download `browserclaw-skill-latest.zip` from Releases) into your agent's skills directory:

- Codex: `~/.codex/skills/browserclaw/SKILL.md`
- Claude Code: `.claude/skills/browserclaw/SKILL.md`
