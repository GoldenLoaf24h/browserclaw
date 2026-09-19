import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  CallToolResult,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListPromptsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import nativeMessagingHostInstance from '../native-messaging-host';
import {
  filterToolSchemas,
  formatErrorForAgent,
  NativeMessageType,
  profileBlockedMessage,
  resolveToolProfile,
  TOOL_SCHEMAS,
  TOOL_CATEGORIES,
  TOOL_NAME_TO_CATEGORY,
} from 'chrome-mcp-shared';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';
import { mediaAssetStore } from '../media-asset-store';
import { getChromeMcpPort, SERVER_CONFIG } from '../constant';
import { FastDecisionEngine } from '../jev';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export async function prepareMediaArgsIfNeeded(name: string, args: any): Promise<void> {
  if (name !== 'chrome_insert_media' || !args) return;
  let targetPath = args.filePath;
  if (
    !targetPath &&
    args.fileUrl &&
    typeof args.fileUrl === 'string' &&
    args.fileUrl.startsWith('file://')
  ) {
    try {
      targetPath = fileURLToPath(args.fileUrl);
    } catch {
      targetPath = args.fileUrl.replace(/^file:\/\/\/?/, '');
    }
  }
  if (!targetPath || args.base64Data || args.mediaUrl) return;

  try {
    const resolvedPath = path.resolve(targetPath);
    const stats = await fs.promises.stat(resolvedPath);
    if (!stats.isFile()) return;

    const ext = path.extname(resolvedPath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.bmp': 'image/bmp',
      '.ico': 'image/x-icon',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.pdf': 'application/pdf',
    };
    const mimeType = args.mimeType || mimeTypes[ext] || 'application/octet-stream';
    const fileName = args.fileName || path.basename(resolvedPath);

    if (stats.size <= 650 * 1024) {
      const buffer = await fs.promises.readFile(resolvedPath);
      args.base64Data = buffer.toString('base64');
      args.fileName = fileName;
      args.mimeType = mimeType;
    } else if (stats.size <= 50 * 1024 * 1024) {
      const assetId = crypto.randomUUID();
      mediaAssetStore.set(assetId, {
        filePath: resolvedPath,
        mimeType,
        fileName,
      });
      const port = getChromeMcpPort();
      args.mediaUrl = `http://${SERVER_CONFIG.HOST}:${port}/media-asset/${assetId}`;
      args.fileName = fileName;
      args.mimeType = mimeType;
    }
  } catch {
    // If file cannot be read here, let extension try or report error
  }
}

// Resolved once at startup: changing the profile requires an MCP server restart.
const TOOL_PROFILE = resolveToolProfile(process.env.CHROME_MCP_TOOL_PROFILE);
const EXPOSED_TOOLS = filterToolSchemas(TOOL_SCHEMAS, TOOL_PROFILE);

const fastDecisionEngine = new FastDecisionEngine();

// Per-session dynamic tool activation store
const sessionExtraTools = new Map<string, Set<string>>();

export const clearSessionExtraTools = (sessionId: string): void => {
  sessionExtraTools.delete(sessionId);
};

export const setupTools = (server: Server, serverSessionId?: string) => {
  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const effectiveSessionId = serverSessionId || 'default';
    const extra = sessionExtraTools.get(effectiveSessionId);
    if (!extra || extra.size === 0) return { tools: EXPOSED_TOOLS };
    const combined = TOOL_SCHEMAS.filter(
      (t) => EXPOSED_TOOLS.some((e) => e.name === t.name) || extra.has(t.name),
    );
    return { tools: combined };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const rawArgs = (request.params.arguments || {}) as any;
    const args = {
      ...rawArgs,
      _meta: rawArgs._meta || (request.params as any)?._meta,
    };
    const sessionId = args?.sessionId || args?.sessionContext || serverSessionId;
    return handleToolCall(request.params.name, args, sessionId, server);
  });

  // List resources handler - REQUIRED BY MCP PROTOCOL
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [] }));

  // List prompts handler - REQUIRED BY MCP PROTOCOL
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: [] }));
};

const handleToolCall = async (
  name: string,
  args: any,
  sessionId?: string,
  server?: Server,
): Promise<CallToolResult> => {
  try {
    const effectiveSessionId = sessionId || 'default';
    const extra = sessionExtraTools.get(effectiveSessionId);
    let isAllowed = EXPOSED_TOOLS.some((t) => t.name === name) || (extra && extra.has(name));
    let autoActivatedCategory: string | undefined;

    if (!isAllowed) {
      const known = TOOL_SCHEMAS.some((t) => t.name === name);
      if (known) {
        const cat = TOOL_NAME_TO_CATEGORY[name];
        if (cat) {
          const catList = TOOL_CATEGORIES[cat] ? TOOL_CATEGORIES[cat].split(' ') : [];
          const set = sessionExtraTools.get(effectiveSessionId) || new Set<string>();
          for (const tName of catList) set.add(tName);
          sessionExtraTools.set(effectiveSessionId, set);
          autoActivatedCategory = cat;
          isAllowed = true;
          if (server && typeof (server as any).sendToolListChanged === 'function') {
            (server as any).sendToolListChanged().catch(() => {});
          }
        }
      }

      if (!isAllowed) {
        return {
          content: [
            {
              type: 'text',
              text: known
                ? profileBlockedMessage(name, TOOL_PROFILE)
                : `Tool "${name}" is not a BrowserClaw tool. Call tools/list to see the ${EXPOSED_TOOLS.length} available tools.`,
            },
          ],
          isError: true,
        };
      }
    }
    if (!nativeMessagingHostInstance.isConnected) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error calling tool: Chrome extension is not connected to the native bridge host. Please open Chrome and ensure the Chrome MCP extension is loaded.',
          },
        ],
        isError: true,
      };
    }

    // Autonomous semantic micro-loop tool runs locally on Native Server
    if (name === 'chrome_act_toward_goal') {
      const actResult = await fastDecisionEngine.run(
        args,
        async (toolName: string, toolArgs: any) => {
          return callToolInternal(toolName, toolArgs, sessionId);
        },
        server,
      );
      const result: CallToolResult = {
        content: [
          {
            type: 'text',
            text: JSON.stringify(actResult, null, 2),
          },
        ],
        isError: false,
      };
      if (autoActivatedCategory && result && Array.isArray(result.content)) {
        result.content.unshift({
          type: 'text',
          text: `[System Note: Tool category "${autoActivatedCategory}" has been dynamically unlocked for this session.]`,
        });
      }
      return result;
    }

    // Dynamic activation hook for chrome_tool_docs
    if (name === 'chrome_tool_docs' && args?.activateForSession && args?.category) {
      const catList = TOOL_CATEGORIES[args.category]
        ? TOOL_CATEGORIES[args.category].split(' ')
        : [];
      if (catList.length > 0) {
        const set = sessionExtraTools.get(effectiveSessionId) || new Set<string>();
        for (const tName of catList) set.add(tName);
        sessionExtraTools.set(effectiveSessionId, set);
      }
      if (server && typeof (server as any).sendToolListChanged === 'function') {
        (server as any).sendToolListChanged().catch(() => {});
      }
    }

    await prepareMediaArgsIfNeeded(name, args);

    const response = await nativeMessagingHostInstance.sendRequestToExtensionAndWait(
      {
        name,
        args,
        sessionId,
      },
      NativeMessageType.CALL_TOOL,
      120000, // 延长到 120 秒，避免性能分析等长任务超时
    );
    if (response.status === 'success') {
      const result = response.data;
      if (autoActivatedCategory && result && Array.isArray(result.content)) {
        result.content.unshift({
          type: 'text',
          text: `[System Note: Tool category "${autoActivatedCategory}" has been dynamically unlocked for this session.]`,
        });
      }
      return result;
    } else {
      return {
        content: [
          {
            type: 'text',
            text: `Error calling tool: ${response.error}`,
          },
        ],
        isError: true,
      };
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: formatErrorForAgent(error, { context: 'Error calling tool' }),
        },
      ],
      isError: true,
    };
  }
};

export const callToolInternal = async (
  name: string,
  args: any,
  sessionId?: string,
  timeoutMs = 120000,
): Promise<any> => {
  await prepareMediaArgsIfNeeded(name, args);
  const response = await nativeMessagingHostInstance.sendRequestToExtensionAndWait(
    {
      name,
      args,
      sessionId,
    },
    NativeMessageType.CALL_TOOL,
    timeoutMs,
  );
  if (response.status === 'success') {
    return response.data;
  }
  throw new Error(response.error || `Error calling internal tool: ${name}`);
};
