import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TOOL_SCHEMAS, TOOL_NAMES } from '../../../packages/shared/src/tools.ts';
import { validateToolAnnotations } from '../fixtures/oracle-evaluators.ts';
import { E2ETestEnvironment } from '../fixtures/mock-server.ts';

describe('Tier 1 - Feature 5: MCP Tool Security Annotations', () => {
  it('test_f05_readonly_hint_compliance: read-only inspection tools declare readOnlyHint: true', () => {
    const readOnlyToolNames = [
      TOOL_NAMES.BROWSER.GET_WINDOWS_AND_TABS,
      TOOL_NAMES.BROWSER.READ_DOM,
      TOOL_NAMES.BROWSER.GET_MARKDOWN,
      TOOL_NAMES.BROWSER.SCREENSHOT,
      TOOL_NAMES.BROWSER.HISTORY,
    ];

    for (const toolName of readOnlyToolNames) {
      const schema = TOOL_SCHEMAS.find((t) => t.name === toolName);
      assert.ok(schema, `Tool schema for ${toolName} must exist`);
      assert.strictEqual(
        (schema as any).annotations?.readOnlyHint,
        true,
        `Tool ${toolName} must have readOnlyHint: true`
      );
    }
  });

  it('test_f05_destructive_hint_compliance: state-mutating tools declare destructiveHint: true', () => {
    const mutatingToolNames = [
      TOOL_NAMES.BROWSER.CLOSE_TABS,
      TOOL_NAMES.BROWSER.COMPUTER,
      TOOL_NAMES.BROWSER.BOOKMARK_DELETE,
      TOOL_NAMES.BROWSER.JAVASCRIPT,
      TOOL_NAMES.BROWSER.INTERACT_INDEX,
      TOOL_NAMES.BROWSER.FILL_INDEX,
      TOOL_NAMES.BROWSER.BATCH_ACTIONS,
    ];

    for (const toolName of mutatingToolNames) {
      const schema = TOOL_SCHEMAS.find((t) => t.name === toolName);
      assert.ok(schema, `Tool schema for ${toolName} must exist`);
      assert.strictEqual(
        (schema as any).annotations?.destructiveHint,
        true,
        `Tool ${toolName} must have destructiveHint: true`
      );
    }
  });

  it('test_f05_idempotent_hint_compliance: idempotent query tools declare idempotentHint: true', () => {
    const idempotentToolNames = [
      TOOL_NAMES.BROWSER.GET_WINDOWS_AND_TABS,
      TOOL_NAMES.BROWSER.READ_DOM,
      TOOL_NAMES.BROWSER.GET_MARKDOWN,
    ];

    for (const toolName of idempotentToolNames) {
      const schema = TOOL_SCHEMAS.find((t) => t.name === toolName);
      assert.ok(schema, `Tool schema for ${toolName} must exist`);
      assert.strictEqual(
        (schema as any).annotations?.idempotentHint,
        true,
        `Tool ${toolName} must have idempotentHint: true`
      );
    }
  });

  it('test_f05_open_world_hint_compliance: browser web interaction tools declare openWorldHint: true', () => {
    const openWorldToolNames = [
      TOOL_NAMES.BROWSER.NAVIGATE,
      TOOL_NAMES.BROWSER.GET_MARKDOWN,
      TOOL_NAMES.BROWSER.READ_DOM,
      TOOL_NAMES.BROWSER.BATCH_ACTIONS,
    ];

    for (const toolName of openWorldToolNames) {
      const schema = TOOL_SCHEMAS.find((t) => t.name === toolName);
      assert.ok(schema, `Tool schema for ${toolName} must exist`);
      assert.strictEqual(
        (schema as any).annotations?.openWorldHint,
        true,
        `Tool ${toolName} must have openWorldHint: true`
      );
    }
  });

  it('test_f05_schema_conformance_with_annotations: all exported tool schemas validate against MCP protocol specification', () => {
    assert.ok(TOOL_SCHEMAS.length >= 30, `Expected at least 30 tool schemas, got ${TOOL_SCHEMAS.length}`);

    for (const tool of TOOL_SCHEMAS) {
      const evaluation = validateToolAnnotations(tool as any);
      assert.strictEqual(
        evaluation.valid,
        true,
        `Tool '${tool.name}' fails annotation validation. Missing: ${evaluation.missingFields.join(', ')}`
      );
      assert.ok(tool.description && tool.description.length > 5, `Tool '${tool.name}' has empty description`);
      assert.ok(tool.inputSchema, `Tool '${tool.name}' missing inputSchema`);
    }

    // Also verify mock test environment tools have proper annotations
    const env = new E2ETestEnvironment();
    for (const [name, tool] of env.tools.entries()) {
      const evalMock = validateToolAnnotations(tool as any);
      assert.strictEqual(evalMock.valid, true, `Mock tool '${name}' missing annotations`);
    }
  });
});
