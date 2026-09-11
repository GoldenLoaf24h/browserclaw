import { describe, it, expect, vi } from 'vitest';
import { grepTool } from '../entrypoints/background/tools/browser/grep';

describe('GrepTool (chrome_grep)', () => {
  it('fails with validation error when query is empty', async () => {
    const res = await grepTool.execute({ query: '' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('query parameter is required');
  });

  it('reports invalid regex gracefully', async () => {
    // Mock resolveAffinityTab
    vi.spyOn(grepTool as any, 'resolveAffinityTab').mockResolvedValue({ id: 123, url: 'https://example.com' });
    const res = await grepTool.execute({ query: '[invalid-regex(', isRegex: true });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('Invalid regular expression');
  });
});
