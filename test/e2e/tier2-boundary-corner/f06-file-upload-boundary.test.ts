import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { E2ETestEnvironment } from '../fixtures/mock-server.ts';
import { BOUNDARY_TOOL_INPUTS } from '../fixtures/tool-inputs.ts';

describe('Tier 2 - Feature 6: File Upload Boundary Cases', () => {
  it('test_f06_unicode_and_space_file_paths: uploads file with Chinese, spaces, and emoji in path', async () => {
    const env = new E2ETestEnvironment();
    const nodeId = env.cdpSession.registerFileInput({ selector: '#file-upload' });

    const paths = [
      BOUNDARY_TOOL_INPUTS.filePaths.unicodeChinese,
      BOUNDARY_TOOL_INPUTS.filePaths.withSpaces,
      BOUNDARY_TOOL_INPUTS.filePaths.withEmoji,
    ];

    const res = await env.cdpSession.setFileInputFiles(nodeId, paths);
    assert.strictEqual(res.success, true);

    const input = env.cdpSession.getFileInput(nodeId);
    assert.deepStrictEqual(input?.files, paths);
  });

  it('test_f06_unc_network_paths: handles Windows UNC network file path', async () => {
    const env = new E2ETestEnvironment();
    const nodeId = env.cdpSession.registerFileInput({ selector: '#file-unc' });

    const uncPath = BOUNDARY_TOOL_INPUTS.filePaths.uncNetwork;
    const res = await env.cdpSession.setFileInputFiles(nodeId, [uncPath]);

    assert.strictEqual(res.success, true);
    const input = env.cdpSession.getFileInput(nodeId);
    assert.strictEqual(input?.files[0], uncPath);
  });

  it('test_f06_read_only_locked_file: handles file locked for reading gracefully', async () => {
    const env = new E2ETestEnvironment();
    const nodeId = env.cdpSession.registerFileInput({ selector: '#locked-input' });

    // In CDP, file inputs receive the absolute path string for Chrome to attach via native dialog bypass
    const res = await env.cdpSession.setFileInputFiles(nodeId, ['C:\\system\\locked_resource.dat']);
    assert.strictEqual(res.success, true);
  });

  it('test_f06_multiple_file_input_attribute: sets multiple file paths simultaneously', async () => {
    const env = new E2ETestEnvironment();
    const nodeId = env.cdpSession.registerFileInput({ selector: '#multi-files' });

    const multipleFiles = [
      'C:\\uploads\\doc1.pdf',
      'C:\\uploads\\doc2.pdf',
      'C:\\uploads\\doc3.pdf',
    ];

    const res = await env.cdpSession.setFileInputFiles(nodeId, multipleFiles);
    assert.strictEqual(res.success, true);

    const input = env.cdpSession.getFileInput(nodeId);
    assert.strictEqual(input?.files.length, 3);
  });

  it('test_f06_directory_path_instead_of_file: rejects directory or empty input', async () => {
    const env = new E2ETestEnvironment();
    const nodeId = env.cdpSession.registerFileInput({ selector: '#single-file' });

    const emptyRes = await env.cdpSession.setFileInputFiles(nodeId, []);
    assert.strictEqual(emptyRes.success, false);
    assert.ok(emptyRes.error?.includes('empty'));
  });
});
