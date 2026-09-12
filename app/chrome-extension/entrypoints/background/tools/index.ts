import { createErrorResponse } from '@/common/tool-handler';
import { ERROR_MESSAGES } from '@/common/constants';
import { formatErrorForAgent, TOOL_SCHEMAS } from 'chrome-mcp-shared';
import * as browserTools from './browser';

const tools = { ...browserTools } as any;
// Only schemas declared in TOOL_SCHEMAS are callable. Some modules export
// internal-only instances — network capture start/stop are invoked directly by
// network-capture.ts, and userscript/inject-script register page listeners
// without being part of the public surface. Deriving the map from the declared
// schemas keeps the callable set exactly equal to tools/list, so an undeclared
// export can never become an invisible, unvalidated entry point.
const declaredToolNames = new Set(TOOL_SCHEMAS.map((t) => t.name));
const toolsMap = new Map(
  Object.values(tools)
    .filter((tool: any) => declaredToolNames.has(tool.name))
    .map((tool: any) => [tool.name, tool]),
);

/**
 * Tool call parameter interface
 */
export interface ToolCallParam {
  name: string;
  args: any;
  sessionId?: string;
}

/**
 * Handle tool execution
 */
export const handleCallTool = async (param: ToolCallParam) => {
  // Pre-flight check: Verify if Agent control switch is enabled by user
  try {
    const session = await chrome.storage.session.get('agentControlEnabled');
    const isEnabled = session.agentControlEnabled !== false; // Default: true (enabled on browser start)
    if (!isEnabled) {
      return createErrorResponse(
        'Agent control is currently paused by the user via the extension popup switch. Please enable the switch in the extension popup to resume browser automation.',
      );
    }
  } catch {
    // If storage.session is unavailable (e.g. test environment), proceed normally
  }

  const tool = toolsMap.get(param.name);
  if (!tool) {
    return createErrorResponse(`Tool ${param.name} not found`);
  }

  try {
    const args = param.args ?? {};
    if (param.sessionId && !args.sessionId) {
      args.sessionId = param.sessionId;
    }
    return await tool.execute(args);
  } catch (error) {
    console.error(`Tool execution failed for ${param.name}:`, error);
    // Keep a bounded stack so an unexpected failure can be located without
    // reproducing it under a debugger.
    return createErrorResponse(
      error instanceof Error
        ? formatErrorForAgent(error, { context: `Tool ${param.name} failed` })
        : ERROR_MESSAGES.TOOL_EXECUTION_FAILED,
    );
  }
};
