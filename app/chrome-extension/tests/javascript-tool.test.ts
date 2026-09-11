import { describe, it, expect } from 'vitest';
import { wrapUserCode } from '../entrypoints/background/tools/browser/javascript';

describe('wrapUserCode', () => {
  it('auto-returns a simple expression', () => {
    const wrapped = wrapUserCode('document.title');
    expect(wrapped).toContain('return (\ndocument.title\n);');
    expect(wrapped).toMatch(/^\(async \(\) => {\n/);
    expect(wrapped).toMatch(/\n}\)\(\)$/);
  });

  it('auto-returns an expression with a trailing semicolon', () => {
    const wrapped = wrapUserCode('window.location.href;');
    expect(wrapped).toContain('return (\nwindow.location.href\n);');
  });

  it('auto-returns an object literal expression', () => {
    const wrapped = wrapUserCode('{ a: 1, b: "test" }');
    expect(wrapped).toContain('return (\n{ a: 1, b: "test" }\n);');
  });

  it('auto-returns an await expression', () => {
    const wrapped = wrapUserCode('await Promise.resolve(42)');
    expect(wrapped).toContain('return (\nawait Promise.resolve(42)\n);');
  });

  it('does not auto-return multi-line statements with declarations', () => {
    const code = 'const x = 10;\nconst y = 20;\nreturn x + y;';
    const wrapped = wrapUserCode(code);
    expect(wrapped).not.toContain('return (\n');
    expect(wrapped).toContain(code);
  });

  it('preserves code that already starts with return', () => {
    const code = 'return document.title;';
    const wrapped = wrapUserCode(code);
    expect(wrapped).not.toContain('return (\nreturn');
    expect(wrapped).toContain(code);
  });

  it('handles statements without return without crashing', () => {
    const code = 'let x = 1;\nx++;';
    const wrapped = wrapUserCode(code);
    expect(wrapped).not.toContain('return (\n');
    expect(wrapped).toContain(code);
  });

  it('handles empty code safely', () => {
    const wrapped = wrapUserCode('   ');
    expect(wrapped).toBe('(async () => {\n   \n})()');
  });

  it('auto-returns an expression with trailing semicolon and comment', () => {
    const wrapped = wrapUserCode('42; // answer');
    expect(wrapped).toContain('return (\n42\n);');
  });

  it('auto-returns an expression with block comments and semicolons', () => {
    const wrapped = wrapUserCode('document.title; /* gets current title */');
    expect(wrapped).toContain('return (\ndocument.title\n);');
  });
});
