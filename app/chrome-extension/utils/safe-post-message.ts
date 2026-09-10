export const MAX_NATIVE_MESSAGE_BYTES = 1024 * 1024; // 1MB physical Native Messaging ceiling

/**
 * Native Messaging 1MB physical ceiling defense:
 * Rejects messages >= 1MB before sending to avoid broken pipe / Native Messaging port disconnection.
 */
export function safePostMessage(
  port: chrome.runtime.Port | null | undefined,
  msg: any,
  fallbackRequestId?: string,
): boolean {
  if (!port) return false;
  try {
    const serialized = JSON.stringify(msg);
    const byteLength = new TextEncoder().encode(serialized).length;
    if (byteLength >= MAX_NATIVE_MESSAGE_BYTES) {
      console.error(
        `[NativeHost] Blocked outgoing message exceeding 1MB physical Native Messaging ceiling: ${byteLength} bytes`,
      );
      const reqId = fallbackRequestId || msg?.responseToRequestId;
      if (reqId) {
        port.postMessage({
          responseToRequestId: reqId,
          payload: {
            status: 'error',
            message: 'Native message rejected: payload exceeded 1MB physical ceiling',
            error: `Payload size (${byteLength} bytes) exceeds Chrome Native Messaging 1MB limit. Large artifacts should be saved to file or paged.`,
          },
        });
      }
      return false;
    }
    port.postMessage(msg);
    return true;
  } catch (err) {
    console.error('[NativeHost] Failed in safePostMessage:', err);
    return false;
  }
}
