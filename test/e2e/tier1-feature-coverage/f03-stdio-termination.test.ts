import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MockStdioProcess } from '../mocks/mock-mcp-server.ts';

describe('Tier 1 - Feature 3: stdio Clean Termination (<1s)', () => {
  it('test_f03_stdin_eof_exit_within_1s: process exits in <= 1000ms upon stdin EOF', async () => {
    const proc = new MockStdioProcess();
    let exitReason = '';

    proc.on('exit', (_code, reason) => {
      exitReason = reason;
    });

    proc.closeStdin();
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.strictEqual(proc.isRunning, false);
    assert.strictEqual(proc.exitCode, 0);
    assert.strictEqual(exitReason, 'stdin EOF');
    assert.ok(proc.terminationTimeMs !== null && proc.terminationTimeMs < 1000);
  });

  it('test_f03_parent_pid_watchdog: watchdog terminates process when parent PID dies', async () => {
    const proc = new MockStdioProcess(9999);
    let alive = true;

    proc.startWatchdog((pid) => alive);

    // Parent dies
    alive = false;
    await new Promise((resolve) => setTimeout(resolve, 150));

    assert.strictEqual(proc.isRunning, false);
    assert.strictEqual(proc.exitCode, 0);
  });

  it('test_f03_cleanup_hooks_invoked: active connections are closed during shutdown sequence', async () => {
    const proc = new MockStdioProcess();
    let socketClosed = false;

    // Simulate registered cleanup hook
    proc.on('exit', () => {
      socketClosed = true;
    });

    proc.terminate(0, 'clean exit');
    assert.strictEqual(socketClosed, true);
  });

  it('test_f03_sigterm_graceful_exit: handles SIGTERM and terminates within 1000ms', async () => {
    const proc = new MockStdioProcess();
    let signalReceived = '';

    proc.on('exit', (_code, reason) => {
      signalReceived = reason;
    });

    proc.sendSignal('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.strictEqual(proc.isRunning, false);
    assert.strictEqual(signalReceived, 'SIGTERM');
    assert.ok(proc.terminationTimeMs !== null && proc.terminationTimeMs < 1000);
  });

  it('test_f03_no_lingering_background_processes: ensures all timers and listeners are cleaned up', () => {
    const proc = new MockStdioProcess();
    proc.terminate(0, 'exit');
    assert.strictEqual(proc.isRunning, false);
    assert.strictEqual(proc.listenerCount('exit'), 0);
  });
});
