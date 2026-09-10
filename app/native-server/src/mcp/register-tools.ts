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
} from 'chrome-mcp-shared';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// Resolved once at startup: changing the profile requires an MCP server restart.
const TOOL_PROFILE = resolveToolProfile(process.env.CHROME_MCP_TOOL_PROFILE);
const EXPOSED_TOOLS = filterToolSchemas(TOOL_SCHEMAS, TOOL_PROFILE);

export const setupTools = (server: Server, serverSessionId?: string) => {
  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: EXPOSED_TOOLS };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const sessionId =
      (request.params.arguments as any)?.sessionId ||
      (request.params.arguments as any)?.sessionContext ||
      serverSessionId;
    return handleToolCall(request.params.name, request.params.arguments || {}, sessionId);
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
): Promise<CallToolResult> => {
  try {
    // A tool that exists but is hidden by the profile should say so, not
    // masquerade as "not found" (the extension would report exactly that).
    if (!EXPOSED_TOOLS.some((t) => t.name === name)) {
      const known = TOOL_SCHEMAS.some((t) => t.name === name);
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

    // 发送请求到Chrome扩展并等待响应
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
      return response.data;
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
