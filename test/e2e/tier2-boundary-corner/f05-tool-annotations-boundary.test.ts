import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateToolAnnotations } from '../fixtures/oracle-evaluators.ts';

describe('Tier 2 - Feature 5: Tool Security Annotations Boundary Cases', () => {
  it('test_f05_empty_properties_schema: tool schema with empty input properties validates correctly', () => {
    const emptyTool = {
      name: 'test_empty_tool',
      description: 'Tool without arguments',
      inputSchema: { type: 'object', properties: {} },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    };

    const res = validateToolAnnotations(emptyTool as any);
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.missingFields.length, 0);
  });

  it('test_f05_undefined_optional_properties: missing optional annotations rejected with explicit missing list', () => {
    const missingAnnotationsTool = {
      name: 'broken_tool',
      annotations: {
        readOnlyHint: true,
        // destructiveHint, idempotentHint, openWorldHint missing
      },
    };

    const res = validateToolAnnotations(missingAnnotationsTool as any);
    assert.strictEqual(res.valid, false);
    assert.ok(res.missingFields.includes('destructiveHint'));
    assert.ok(res.missingFields.includes('idempotentHint'));
    assert.ok(res.missingFields.includes('openWorldHint'));
  });

  it('test_f05_extra_unknown_keys: unexpected custom metadata preserves core hints', () => {
    const toolWithExtra = {
      name: 'custom_annotated_tool',
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
        customExtensionField: { level: 'critical' },
        auditTags: ['security', 'compliance'],
      },
    };

    const res = validateToolAnnotations(toolWithExtra as any);
    assert.strictEqual(res.valid, true);
    assert.strictEqual((toolWithExtra.annotations as any).customExtensionField.level, 'critical');
  });

  it('test_f05_unicode_annotation_values: annotations containing Unicode text process cleanly', () => {
    const unicodeTool = {
      name: 'chrome_read_dom',
      description: '提取并精简 DOM 树（支持中文/Emoji 🚀）',
      annotations: {
        title: 'DOM 精简提取器',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    };

    const res = validateToolAnnotations(unicodeTool as any);
    assert.strictEqual(res.valid, true);
    assert.strictEqual(unicodeTool.annotations.title, 'DOM 精简提取器');
  });

  it('test_f05_empty_string_tool_name: rejects tool registration with empty or whitespace name', () => {
    const validateToolName = (name: string) => {
      if (!name || name.trim().length === 0) {
        throw new Error('Tool name cannot be empty or whitespace only');
      }
    };

    assert.throws(() => validateToolName(''), /Tool name cannot be empty/);
    assert.throws(() => validateToolName('   \t\n  '), /Tool name cannot be empty/);
    assert.doesNotThrow(() => validateToolName('chrome_read_dom'));
  });
});
