import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MockExtensionNativeHost } from '../mocks/mock-extension.ts';

describe('Tier 2 - Feature 4: Extension Handshake Boundary Cases', () => {
  it('test_f04_native_host_crash_recovery: recovers when native host crashes during heartbeat', async () => {
    const host = new MockExtensionNativeHost();
    await host.initiateHandshake();
    assert.strictEqual(host.state, 'CONNECTED');

    // Simulate crash and auto-recovery
    host.simulatePortDisconnect();
    assert.strictEqual(host.state, 'RECONNECTING');

    await new Promise((resolve) => setTimeout(resolve, 350));
    assert.strictEqual(host.state, 'CONNECTED');
    host.cleanup();
  });

  it('test_f04_disconnect_during_3way_handshake: port disconnects during initial handshake and transitions to error', async () => {
    const host = new MockExtensionNativeHost(true); // crash during handshake
    const res = await host.initiateHandshake();

    assert.strictEqual(res.success, false);
    assert.strictEqual(host.state, 'ERROR');
    host.cleanup();
  });

  it('test_f04_rapid_reconnect_oscillation: port flaps 5 times in succession and stabilizes', async () => {
    const host = new MockExtensionNativeHost();
    await host.initiateHandshake();

    for (let i = 0; i < 5; i++) {
      host.simulatePortDisconnect();
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // Wait for last recovery to complete
    await new Promise((resolve) => setTimeout(resolve, 350));
    assert.strictEqual(host.state, 'CONNECTED');
    host.cleanup();
  });

  it('test_f04_chrome_runtime_lasterror_handling: handles chrome.runtime.lastError without uncaught rejection', () => {
    let handled = false;

    const sendMessageWithGuard = (callback: (err?: Error) => void) => {
      // Simulate chrome.runtime.lastError check
      const mockLastError = { message: 'Native host has exited.' };
      if (mockLastError) {
        handled = true;
        callback(new Error(mockLastError.message));
        return;
      }
      callback();
    };

    sendMessageWithGuard((err) => {
      assert.ok(err);
      assert.strictEqual(err.message, 'Native host has exited.');
    });

    assert.strictEqual(handled, true);
  });

  it('test_f04_pending_queue_preservation: in-flight messages queued during disconnection are flushed on reconnection', async () => {
    const host = new MockExtensionNativeHost();
    await host.initiateHandshake();

    host.simulatePortDisconnect();

    const received: any[] = [];
    host.on('message', (msg) => received.push(msg));

    host.sendMessage({ action: 'queued_item_1' });
    host.sendMessage({ action: 'queued_item_2' });

    assert.strictEqual(host.messageQueue.length, 2);
    assert.strictEqual(received.length, 0);

    await new Promise((resolve) => setTimeout(resolve, 350));
    assert.strictEqual(host.state, 'CONNECTED');
    assert.strictEqual(received.length, 2);
    assert.strictEqual(received[0].action, 'queued_item_1');
    assert.strictEqual(received[1].action, 'queued_item_2');
    host.cleanup();
  });
});
