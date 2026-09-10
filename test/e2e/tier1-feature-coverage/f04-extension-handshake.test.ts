import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MockExtensionNativeHost } from '../mocks/mock-extension.ts';

describe('Tier 1 - Feature 4: Chrome Extension Handshake Self-Healing', () => {
  it('test_f04_two_way_handshake: establishes connected status with native messaging host', async () => {
    const host = new MockExtensionNativeHost();
    const result = await host.initiateHandshake();

    assert.strictEqual(result.success, true);
    assert.strictEqual(host.state, 'CONNECTED');
    assert.ok(result.latencyMs < 3000);
    host.cleanup();
  });

  it('test_f04_heartbeat_ping_pong: active heartbeat keeps connection verified', async () => {
    const host = new MockExtensionNativeHost();
    await host.initiateHandshake();

    await new Promise((resolve) => setTimeout(resolve, 450));

    assert.ok(host.pingPongCount >= 2);
    assert.ok(host.lastPongSentAt > 0);
    host.cleanup();
  });

  it('test_f04_transient_disconnect_recovery: self-healing restores connected state in <= 3000ms', async () => {
    const host = new MockExtensionNativeHost();
    await host.initiateHandshake();

    let recovered = false;
    let recoveryMs = 0;

    host.on('reconnected', (data) => {
      recovered = true;
      recoveryMs = data.recoveryTimeMs;
    });

    host.simulatePortDisconnect();
    assert.strictEqual(host.state, 'RECONNECTING');

    await new Promise((resolve) => setTimeout(resolve, 350));

    assert.strictEqual(recovered, true);
    assert.strictEqual(host.state, 'CONNECTED');
    assert.ok(recoveryMs <= 3000);
    host.cleanup();
  });

  it('test_f04_http_ping_fallback: message queue preserved during reconnect', async () => {
    const host = new MockExtensionNativeHost();
    await host.initiateHandshake();

    host.simulatePortDisconnect();

    // Send message during transient disconnect
    const sendResult = host.sendMessage({ type: 'GET_ACTIVE_TAB' });
    assert.strictEqual(sendResult.queued, true);
    assert.strictEqual(host.messageQueue.length, 1);

    await new Promise((resolve) => setTimeout(resolve, 350));

    // Message flushed upon self-healing reconnection
    assert.strictEqual(host.state, 'CONNECTED');
    assert.strictEqual(host.messageQueue.length, 0);
    host.cleanup();
  });

  it('test_f04_state_transition_lifecycle: lifecycle sequence matches specification', async () => {
    const host = new MockExtensionNativeHost();
    await host.initiateHandshake();
    host.simulatePortDisconnect();
    await new Promise((resolve) => setTimeout(resolve, 350));

    // Expected transition sequence: DISCONNECTED -> CONNECTING -> CONNECTED -> DISCONNECTED -> RECONNECTING -> CONNECTED
    assert.ok(host.stateHistory.includes('CONNECTING'));
    assert.ok(host.stateHistory.includes('CONNECTED'));
    assert.ok(host.stateHistory.includes('DISCONNECTED'));
    assert.ok(host.stateHistory.includes('RECONNECTING'));
    assert.strictEqual(host.stateHistory[host.stateHistory.length - 1], 'CONNECTED');
    host.cleanup();
  });
});
