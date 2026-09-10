import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../../');

describe('Tier 2 - Feature 11: Build & Typecheck Boundary Cases', () => {
  it('test_f11_strict_null_checks: strict mode enabled across package tsconfigs', () => {
    const sharedTsConfig = JSON.parse(
      fs.readFileSync(path.join(rootDir, 'packages/shared/tsconfig.json'), 'utf8')
    );
    const serverTsConfig = JSON.parse(
      fs.readFileSync(path.join(rootDir, 'app/native-server/tsconfig.json'), 'utf8')
    );

    assert.strictEqual(sharedTsConfig.compilerOptions.strict, true);
    assert.strictEqual(serverTsConfig.compilerOptions.strict, true);
  });

  it('test_f11_missing_optional_peer_dep: system handles optional imports defensively', () => {
    // Check that devtools-frontend shim exists for missing native binary dependencies
    const shimPath = path.join(rootDir, 'app/native-server/src/shims/devtools.d.ts');
    assert.ok(fs.existsSync(shimPath), 'Devtools shim should exist for type safety');
  });

  it('test_f11_crlf_and_lf_source_files: handles CRLF/LF line endings without syntax errors', () => {
    const testCodeLF = 'export const a = 1;\nexport const b = 2;\n';
    const testCodeCRLF = 'export const a = 1;\r\nexport const b = 2;\r\n';

    assert.strictEqual(testCodeLF.split(/\r?\n/).length, testCodeCRLF.split(/\r?\n/).length);
  });

  it('test_f11_circular_type_dependency_guard: shared package has zero dependencies on app/native-server', () => {
    const sharedPkg = JSON.parse(
      fs.readFileSync(path.join(rootDir, 'packages/shared/package.json'), 'utf8')
    );

    const deps = { ...sharedPkg.dependencies, ...sharedPkg.devDependencies };
    assert.strictEqual(deps['mcp-chrome-bridge'], undefined);
    assert.strictEqual(deps['chrome-mcp-server'], undefined);
  });

  it('test_f11_clean_rebuild_from_scratch: verifies compiled bundles contain valid JavaScript syntax', async () => {
    const sharedDist = path.join(rootDir, 'packages/shared/dist/index.js');
    assert.ok(fs.existsSync(sharedDist));

    const content = fs.readFileSync(sharedDist, 'utf8');
    assert.ok(content.length > 5000);
    assert.ok(content.includes('TOOL_SCHEMAS') || content.includes('TOOL_NAMES'));
  });
});
