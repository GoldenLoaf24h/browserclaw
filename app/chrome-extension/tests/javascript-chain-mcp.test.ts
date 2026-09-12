import { describe, it, expect, beforeEach, vi } from 'vitest';
import { wrapUserCode, MCP_INPAGE_HELPERS } from '../entrypoints/background/tools/browser/javascript';

describe('Code-Driven Chained In-Page MCP Helpers', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('injects MCP_INPAGE_HELPERS inside wrapUserCode for non-empty code', () => {
    const wrapped = wrapUserCode('return 42;');
    expect(wrapped).toContain('const mcp = (() => {');
    expect(wrapped).toContain('return 42;');
  });

  it('evaluates mcp.fill, mcp.click, and mcp.extract on live DOM', async () => {
    // Setup mock input and button
    const input = document.createElement('input');
    input.id = 'username';
    input.type = 'text';
    document.body.appendChild(input);

    const btn = document.createElement('button');
    btn.id = 'submit-btn';
    btn.textContent = 'Submit';
    document.body.appendChild(btn);

    const clickedSpy = vi.fn();
    btn.addEventListener('click', clickedSpy);

    // Evaluate code using the injected mcp helpers
    const userScript = `
      ${MCP_INPAGE_HELPERS}
      await mcp.fill('#username', 'testuser');
      await mcp.click('#submit-btn');
      return {
        val: mcp.extract('#username', 'value'),
        txt: mcp.extract('#submit-btn', 'text')
      };
    `;

    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction(userScript);
    const result = await fn();

    expect(input.value).toBe('testuser');
    expect(clickedSpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ val: 'testuser', txt: 'Submit' });
  });

  it('supports mcp.sleep utility delay', async () => {
    const userScript = `
      ${MCP_INPAGE_HELPERS}
      const t0 = Date.now();
      await mcp.sleep(50);
      return Date.now() - t0;
    `;

    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction(userScript);
    const elapsed = await fn();
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });
});
