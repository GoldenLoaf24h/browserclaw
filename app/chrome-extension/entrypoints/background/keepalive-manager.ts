/**
 * @fileoverview Keepalive Manager
 * @description In-memory singleton service for tracking background tasks.
 * In Chrome MV3, Native Messaging ports automatically keep the Service Worker alive.
 */

const LOG_PREFIX = '[KeepaliveManager]';
const ALARM_NAME = 'mcp_keepalive_heartbeat';
const activeTags = new Set<string>();
let heartbeatInterval: any = null;

function ensureHeartbeat(): void {
  if (typeof chrome === 'undefined') return;

  if (!heartbeatInterval && activeTags.size > 0) {
    // 1. Regular interval calling a lightweight chrome.* API to reset Chrome MV3's 30s SW idle timer
    heartbeatInterval = setInterval(() => {
      if (activeTags.size === 0) {
        stopHeartbeat();
        return;
      }
      try {
        if (chrome.runtime?.getPlatformInfo) {
          chrome.runtime.getPlatformInfo(() => {});
        }
      } catch {}
    }, 20_000);
  }

  // 2. chrome.alarms backup heartbeat
  try {
    if (chrome.alarms?.create && activeTags.size > 0) {
      chrome.alarms.create(ALARM_NAME, { periodInMinutes: 0.5 });
    }
  } catch {}
}

function stopHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  try {
    if (typeof chrome !== 'undefined' && chrome.alarms?.clear) {
      chrome.alarms.clear(ALARM_NAME);
    }
  } catch {}
}

// Setup alarm listener once
if (typeof chrome !== 'undefined' && chrome.alarms?.onAlarm?.addListener) {
  try {
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === ALARM_NAME) {
        if (activeTags.size === 0) {
          stopHeartbeat();
        } else {
          console.debug(`${LOG_PREFIX} Heartbeat pulse (active tasks: ${activeTags.size})`);
        }
      }
    });
  } catch {}
}

export function acquireKeepalive(tag: string): () => void {
  activeTags.add(tag);
  ensureHeartbeat();
  console.debug(`${LOG_PREFIX} Acquired keepalive for tag: ${tag} (total: ${activeTags.size})`);
  return () => {
    activeTags.delete(tag);
    if (activeTags.size === 0) {
      stopHeartbeat();
    }
    console.debug(`${LOG_PREFIX} Released keepalive for tag: ${tag} (total: ${activeTags.size})`);
  };
}

export function isKeepaliveActive(): boolean {
  return activeTags.size > 0;
}

export function getKeepaliveRefCount(): number {
  return activeTags.size;
}
