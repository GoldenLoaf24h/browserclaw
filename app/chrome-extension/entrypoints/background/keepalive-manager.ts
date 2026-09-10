/**
 * @fileoverview Keepalive Manager
 * @description In-memory singleton service for tracking background tasks.
 * In Chrome MV3, Native Messaging ports automatically keep the Service Worker alive.
 */

const LOG_PREFIX = '[KeepaliveManager]';
const activeTags = new Set<string>();

export function acquireKeepalive(tag: string): () => void {
  activeTags.add(tag);
  console.debug(`${LOG_PREFIX} Acquired keepalive for tag: ${tag} (total: ${activeTags.size})`);
  return () => {
    activeTags.delete(tag);
    console.debug(`${LOG_PREFIX} Released keepalive for tag: ${tag} (total: ${activeTags.size})`);
  };
}

export function isKeepaliveActive(): boolean {
  return activeTags.size > 0;
}

export function getKeepaliveRefCount(): number {
  return activeTags.size;
}
