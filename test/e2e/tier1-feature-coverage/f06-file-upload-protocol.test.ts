import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { E2ETestEnvironment } from '../fixtures/mock-server.ts';
import { MockCdpSession } from '../mocks/mock-cdp.ts';

describe('Tier 1 - Feature 6: File Upload & file:// Protocol Support', () => {
  it('test_f06_standard_file_input_upload: CDP DOM.setFileInputFiles binds file path to visible file input', async () => {
    const env = new E2ETestEnvironment();
    const nodeId = env.cdpSession.registerFileInput({
      selector: '#visible-file-input',
      isHidden: false,
    });

    const res = await env.cdpSession.setFileInputFiles(nodeId, ['C:\\documents\\test.pdf']);
    assert.strictEqual(res.success, true);

    const inputState = env.cdpSession.getFileInput(nodeId);
    assert.ok(inputState);
    assert.deepStrictEqual(inputState.files, ['C:\\documents\\test.pdf']);
  });

  it('test_f06_hidden_file_input_upload: successfully uploads to display:none or hidden file input', async () => {
    const env = new E2ETestEnvironment();
    const hiddenNodeId = env.cdpSession.registerFileInput({
      selector: '#custom-upload-hidden-input',
      isHidden: true,
    });

    const res = await env.cdpSession.setFileInputFiles(hiddenNodeId, ['C:\\images\\avatar.png']);
    assert.strictEqual(res.success, true);

    const inputState = env.cdpSession.getFileInput(hiddenNodeId);
    assert.ok(inputState);
    assert.strictEqual(inputState.isHidden, true);
    assert.deepStrictEqual(inputState.files, ['C:\\images\\avatar.png']);
  });

  it('test_f06_change_event_dispatch: dispatches composed input and change events on upload', async () => {
    const env = new E2ETestEnvironment();
    const nodeId = env.cdpSession.registerFileInput({ selector: '#upload-zone' });

    let eventEmitted = false;
    env.cdpSession.on('fileInputChanged', (payload) => {
      if (payload.nodeId === nodeId) {
        eventEmitted = true;
        assert.ok(payload.events.includes('input'));
        assert.ok(payload.events.includes('change'));
      }
    });

    await env.cdpSession.setFileInputFiles(nodeId, ['C:\\data\\export.csv']);
    assert.strictEqual(eventEmitted, true);

    const inputState = env.cdpSession.getFileInput(nodeId);
    assert.deepStrictEqual(inputState?.eventsDispatched, ['input', 'change']);
  });

  it('test_f06_windows_file_protocol_normalization: normalizes file:/// and Windows backslashes properly', () => {
    const cdp = new MockCdpSession();

    const test1 = cdp.normalizeFilePath('file:///C:/Users/test/doc.pdf');
    assert.strictEqual(test1.isFileProtocol, true);
    assert.strictEqual(test1.normalizedPath, 'C:\\Users\\test\\doc.pdf');

    const test2 = cdp.normalizeFilePath('file://D:/projects/code.ts');
    assert.strictEqual(test2.isFileProtocol, true);
    assert.strictEqual(test2.normalizedPath, 'D:\\projects\\code.ts');

    const test3 = cdp.normalizeFilePath('C:\\Windows\\System32\\calc.exe');
    assert.strictEqual(test3.isFileProtocol, false);
    assert.strictEqual(test3.normalizedPath, 'C:\\Windows\\System32\\calc.exe');
  });

  it('test_f06_nonexistent_file_rejection: returns validation error when file does not exist', async () => {
    const env = new E2ETestEnvironment();
    const nodeId = env.cdpSession.registerFileInput({ selector: '#file-input' });

    const res = await env.cdpSession.setFileInputFiles(nodeId, [
      'C:\\non_existent_dir_12345\\ghost_file.xyz',
    ]);
    assert.strictEqual(res.success, false);
    assert.ok(res.error?.includes('File not found'));
  });
});
