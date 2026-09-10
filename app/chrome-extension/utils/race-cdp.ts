import { cdpSessionManager } from './cdp-session-manager.ts';

export interface DialogInfo {
  type: string;
  message: string;
  defaultPrompt: string;
}

export class DialogOpenedError extends Error {
  dialog: DialogInfo;
  constructor(dialog: DialogInfo) {
    super(`A native JavaScript dialog (${dialog.type}: "${dialog.message}") opened and paused execution.`);
    this.name = 'DialogOpenedError';
    this.dialog = dialog;
  }
}

export function createDialogInterruptResponse(err: DialogOpenedError | DialogInfo) {
  const dialog = err instanceof DialogOpenedError ? err.dialog : err;
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          success: false,
          requiresDialogAction: true,
          dialog: {
            type: dialog.type,
            message: dialog.message,
            defaultPrompt: dialog.defaultPrompt,
          },
        }),
      },
    ],
    isError: false,
  };
}

/**
 * Race a CDP dispatch against a short timeout or instant dialog opening event,
 * so an unresponsive renderer surfaces a structured error instead of deadlocking.
 */
export async function raceCdp<T>(tabId: number, method: string, params: object, ms = 3000): Promise<T> {
  const pending = cdpSessionManager.getPendingDialog(tabId);
  if (pending) {
    throw new DialogOpenedError(pending);
  }

  let timer: any;
  let observer: ((eventTabId: number, method: string, params: any) => void) | null = null;

  try {
    const racePromise = new Promise<never>((_, reject) => {
      observer = (eventTabId: number, eventMethod: string, eventParams: any) => {
        if (eventTabId === tabId && eventMethod === 'Page.javascriptDialogOpening') {
          reject(
            new DialogOpenedError({
              type: String(eventParams?.type || 'alert'),
              message: String(eventParams?.message || ''),
              defaultPrompt: String(eventParams?.defaultPrompt || ''),
            }),
          );
        }
      };
      cdpSessionManager.addCdpEventObserver(observer);

      timer = setTimeout(() => {
        const currentPending = cdpSessionManager.getPendingDialog(tabId);
        if (currentPending) {
          reject(new DialogOpenedError(currentPending));
        } else {
          reject(
            new Error(
              `CDP_DISPATCH_TIMEOUT:${method}: renderer not acking (modal dialog is open or tab is hidden), call chrome_handle_dialog first`,
            ),
          );
        }
      }, ms);
    });

    return await Promise.race([
      cdpSessionManager.sendCommand(tabId, method, params as any),
      racePromise,
    ]);
  } finally {
    clearTimeout(timer);
    if (observer) {
      cdpSessionManager.removeCdpEventObserver(observer);
    }
  }
}

