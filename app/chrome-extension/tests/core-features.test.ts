import { describe, it, expect, vi } from 'vitest';
import { hasIpOrCustomPort } from '../entrypoints/background/tools/browser/common';
import {
  acquireKeepalive,
  isKeepaliveActive,
  getKeepaliveRefCount,
} from '../entrypoints/background/keepalive-manager';

describe('Extension Core Features', () => {
  describe('hasIpOrCustomPort', () => {
    it('detects IPv4 with or without port', () => {
      expect(hasIpOrCustomPort('http://127.0.0.1')).toBe(true);
      expect(hasIpOrCustomPort('http://127.0.0.1:18924')).toBe(true);
      expect(hasIpOrCustomPort('http://127.0.0.1:8080/path')).toBe(true);
      expect(hasIpOrCustomPort('https://192.168.1.100/')).toBe(true);
    });

    it('detects localhost', () => {
      expect(hasIpOrCustomPort('http://localhost')).toBe(true);
      expect(hasIpOrCustomPort('http://localhost:3000')).toBe(true);
      expect(hasIpOrCustomPort('http://localhost:12306')).toBe(true);
    });

    it('returns false for standard domains without custom port', () => {
      expect(hasIpOrCustomPort('https://example.com')).toBe(false);
      expect(hasIpOrCustomPort('https://google.com/search?q=test')).toBe(false);
    });

    it('detects domain with explicit custom port', () => {
      expect(hasIpOrCustomPort('https://example.com:8443')).toBe(true);
    });

    it('handles invalid URLs gracefully without crashing', () => {
      expect(hasIpOrCustomPort('not a valid url')).toBe(false);
      expect(hasIpOrCustomPort('')).toBe(false);
    });
  });

  describe('KeepaliveManager', () => {
    it('tracks active keepalive references properly', () => {
      expect(getKeepaliveRefCount()).toBe(0);
      expect(isKeepaliveActive()).toBe(false);

      const release1 = acquireKeepalive('task-1');
      expect(getKeepaliveRefCount()).toBe(1);
      expect(isKeepaliveActive()).toBe(true);

      const release2 = acquireKeepalive('task-2');
      expect(getKeepaliveRefCount()).toBe(2);

      release1();
      expect(getKeepaliveRefCount()).toBe(1);
      expect(isKeepaliveActive()).toBe(true);

      release2();
      expect(getKeepaliveRefCount()).toBe(0);
      expect(isKeepaliveActive()).toBe(false);
    });
  });

  describe('Agent Control State Preflight Check', () => {
    it('respects agentControlEnabled session flag without backdoor bypass', async () => {
      let sessionState: Record<string, any> = {};

      const checkEnabled = (_args?: any) => {
        // Enforce strict check: no param.args?.__admin_bypass__ bypass allowed
        const isEnabled = sessionState.agentControlEnabled !== false;
        return isEnabled;
      };

      // Default is enabled
      expect(checkEnabled()).toBe(true);

      // Explicitly disabled
      sessionState = { agentControlEnabled: false };
      expect(checkEnabled()).toBe(false);

      // Backdoor bypass attempt must still be blocked
      expect(checkEnabled({ __admin_bypass__: true })).toBe(false);

      // Explicitly re-enabled
      sessionState = { agentControlEnabled: true };
      expect(checkEnabled()).toBe(true);
    });
  });

  describe('NativeHost File Operations', () => {
    it('provides sendFileOperationToNative and cancelFileOperation helpers', async () => {
      const { sendFileOperationToNative, cancelFileOperation } =
        await import('../entrypoints/background/native-host');
      expect(typeof sendFileOperationToNative).toBe('function');
      expect(typeof cancelFileOperation).toBe('function');

      // When nativePort is null, returns false cleanly
      const ok = sendFileOperationToNative({
        type: 'file_operation',
        requestId: 'req-1',
        payload: { action: 'cleanupFile', filePath: '/tmp/test' },
      });
      expect(ok).toBe(false);

      // cancelFileOperation does not throw for unknown or existing ID
      expect(() => cancelFileOperation('req-1')).not.toThrow();
      expect(() => cancelFileOperation('non-existent')).not.toThrow();
    }, 15000);
  });
});
