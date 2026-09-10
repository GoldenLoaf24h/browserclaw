import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../../');

describe('Tier 1 - Feature 11: Monorepo Build & Typecheck Cleanliness', () => {
  it('test_f11_shared_package_build: verifies packages/shared dist artifacts exist in ESM and CJS format', () => {
    const sharedDistDir = path.join(rootDir, 'packages/shared/dist');
    assert.ok(fs.existsSync(sharedDistDir), 'packages/shared/dist must exist');

    const esmBundle = path.join(sharedDistDir, 'index.mjs');
    const cjsBundle = path.join(sharedDistDir, 'index.js');
    const dtsBundle = path.join(sharedDistDir, 'index.d.ts');

    assert.ok(fs.existsSync(esmBundle), 'index.mjs must exist');
    assert.ok(fs.existsSync(cjsBundle), 'index.js must exist');
    assert.ok(fs.existsSync(dtsBundle), 'index.d.ts must exist');

    const esmContent = fs.readFileSync(esmBundle, 'utf8');
    assert.ok(esmContent.length > 1000, 'index.mjs should not be empty');
  });

  it('test_f11_dead_module_removal: verifies @chrome-mcp/wasm-simd is completely removed from packages and package.json', () => {
    const wasmDir = path.join(rootDir, 'packages/wasm-simd');
    assert.strictEqual(fs.existsSync(wasmDir), false, 'packages/wasm-simd must be physically removed');

    const rootPkgPath = path.join(rootDir, 'package.json');
    const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));

    const typecheckScript = rootPkg.scripts?.typecheck || '';
    const buildScript = rootPkg.scripts?.build || '';

    assert.strictEqual(
      typecheckScript.includes('@chrome-mcp/wasm-simd'),
      false,
      'Root typecheck script should not reference @chrome-mcp/wasm-simd',
    );
    assert.strictEqual(
      buildScript.includes('@chrome-mcp/wasm-simd'),
      false,
      'Root build script should not reference @chrome-mcp/wasm-simd',
    );
  });

  it('test_f11_export_resolution: package.json exports map to valid dist files', () => {
    const sharedPkgPath = path.join(rootDir, 'packages/shared/package.json');
    const sharedPkg = JSON.parse(fs.readFileSync(sharedPkgPath, 'utf8'));

    assert.ok(sharedPkg.exports?.['.']?.import?.default);
    assert.ok(sharedPkg.exports?.['.']?.require?.default);

    const importTarget = path.resolve(rootDir, 'packages/shared', sharedPkg.exports['.'].import.default);
    const requireTarget = path.resolve(rootDir, 'packages/shared', sharedPkg.exports['.'].require.default);

    assert.ok(fs.existsSync(importTarget), `Import target ${importTarget} must exist`);
    assert.ok(fs.existsSync(requireTarget), `Require target ${requireTarget} must exist`);
  });

  it('test_f11_native_server_build_config: native server package defines valid build script and bin entries', () => {
    const serverPkgPath = path.join(rootDir, 'app/native-server/package.json');
    const serverPkg = JSON.parse(fs.readFileSync(serverPkgPath, 'utf8'));

    assert.ok(serverPkg.scripts?.build, 'Native server must define build script');
    assert.ok(serverPkg.bin?.['mcp-chrome-bridge'], 'Native server must define CLI bin');
    assert.ok(serverPkg.bin?.['mcp-chrome-stdio'], 'Native server must define stdio bin');
  });

  it('test_f11_clean_distribution_target: native server dist contains entry points and scripts', () => {
    const serverDist = path.join(rootDir, 'app/native-server/dist');
    assert.ok(fs.existsSync(serverDist), 'app/native-server/dist must exist');

    const mainEntry = path.join(serverDist, 'index.js');
    const cliEntry = path.join(serverDist, 'cli.js');
    const stdioEntry = path.join(serverDist, 'mcp/mcp-server-stdio.js');

    assert.ok(fs.existsSync(mainEntry), 'dist/index.js must exist');
    assert.ok(fs.existsSync(cliEntry), 'dist/cli.js must exist');
    assert.ok(fs.existsSync(stdioEntry), 'dist/mcp/mcp-server-stdio.js must exist');
  });
});
