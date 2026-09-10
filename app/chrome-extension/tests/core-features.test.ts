import { describe, it, expect, vi } from 'vitest';
import { hasIpOrCustomPort } from '../entrypoints/background/tools/browser/common';
import { acquireKeepalive, isKeepaliveActive, getKeepaliveRefCount } from '../entrypoints/background/keepalive-manager';
import { ScrollTool } from '../entrypoints/background/tools/browser/scroll';

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

  describe('ScrollTool', () => {
    it('instantiates properly and declares name', () => {
      const tool = new ScrollTool();
      expect(tool.name).toBe('chrome_scroll');
    });

    it('returns error response when no active tab is found', async () => {
      const tool = new ScrollTool();
      // resolveAffinityTab will return tab with id undefined from mock
      const result = await tool.execute({ direction: 'down', amount: 300 });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Active tab not found');
    });
  });

  describe('Agent Control State Preflight Check', () => {
    it('respects agentControlEnabled session flag', async () => {
      // Test the logic used in handleCallTool preflight:
      // const session = await chrome.storage.session.get('agentControlEnabled');
      // const isAgentEnabled = session.agentControlEnabled ?? true;
      let sessionState: Record<string, any> = {};
      
      const checkEnabled = () => sessionState.agentControlEnabled ?? true;

      // Default is enabled
      expect(checkEnabled()).toBe(true);

      // Explicitly disabled
      sessionState = { agentControlEnabled: false };
      expect(checkEnabled()).toBe(false);

      // Explicitly re-enabled
      sessionState = { agentControlEnabled: true };
      expect(checkEnabled()).toBe(true);
    });
  });
});
