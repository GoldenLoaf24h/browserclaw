import { createErrorResponse, ToolResult } from '../../../../common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'chrome-mcp-shared';
import { cdpSessionManager } from '../../../../utils/cdp-session-manager';
import { DIAGNOSTIC_REFRESH_GUIDANCE } from './dom-indexer';
import { executeInPage } from './in-page-engine';
import { sendFileOperationToNative, cancelFileOperation } from '../../native-host';

interface FileUploadToolParams {
  selector?: string; // CSS selector for the file input element
  index?: number; // Compact 1-based numeric index from chrome_read_dom
  clickTargetIndex?: number; // Compact 1-based numeric index to click to trigger file chooser dialog
  filePath?: string; // Local file path
  fileUrl?: string; // URL to download file from
  base64Data?: string; // Base64 encoded file data
  fileName?: string; // Optional filename when using base64 or URL
  multiple?: boolean; // Whether to allow multiple files
  tabId?: number; // Target existing tab id
  windowId?: number; // When no tabId, pick active tab from this window
  sessionId?: string; // Session affinity identifier
  sessionContext?: string;
}

/**
 * Tool for uploading files to web forms using Chrome DevTools Protocol
 * Similar to Playwright's setInputFiles implementation
 */
export class FileUploadTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.FILE_UPLOAD;
  constructor() {
    super();
  }

  /**
   * Execute file upload operation using Chrome DevTools Protocol
   */
  async execute(args: FileUploadToolParams): Promise<ToolResult> {
    const { selector, index, filePath, fileUrl, base64Data, fileName, multiple = false } = args;

    console.log(`Starting file upload operation with options:`, args);

    const hasClickTarget = typeof args.clickTargetIndex === 'number' && args.clickTargetIndex > 0;
    const hasIndex = typeof index === 'number' && index > 0;
    const targetSelector = selector;

    // Validate input
    if (!targetSelector && !hasIndex && !hasClickTarget) {
      return createErrorResponse(
        'Either selector, index, or clickTargetIndex must be provided for file upload',
      );
    }

    if (!filePath && !fileUrl && !base64Data) {
      return createErrorResponse('One of filePath, fileUrl, or base64Data must be provided');
    }

    const createdTempFiles: string[] = [];

    try {
      // Resolve tab
      const tab = await this.resolveAffinityTab({
        tabId: args.tabId,
        windowId: args.windowId,
        sessionId: args.sessionId || (args as any).sessionContext,
      });
      if (!tab.id) return createErrorResponse('No active tab found');
      const tabId = tab.id;

      // Prepare file paths
      let files: string[] = [];

      if (filePath) {
        // Direct file path provided
        files = [filePath];
      } else if (fileUrl || base64Data) {
        // For URL or base64, we need to use the native messaging host
        // to download or save the file temporarily
        const prepResult = await this.prepareFileFromRemote({
          fileUrl,
          base64Data,
          fileName: fileName || 'uploaded-file',
        });
        if (!prepResult.filePath) {
          return createErrorResponse(prepResult.error || 'Failed to prepare file for upload');
        }
        createdTempFiles.push(prepResult.filePath);
        files = [prepResult.filePath];
      }

      // Mode 1: Dynamic File Chooser Interception (Ant Design, Element Plus dynamic dialogs)
      if (hasClickTarget) {
        const clickIndex = args.clickTargetIndex!;
        let openedEvent: any = null;

        await cdpSessionManager.withSession(tabId, 'file-upload-dialog', async () => {
          // Enable Page and DOM domains
          await cdpSessionManager.sendCommand(tabId, 'Page.enable', {});
          await cdpSessionManager.sendCommand(tabId, 'DOM.enable', {});

          // Enable CDP file chooser interception
          await cdpSessionManager.sendCommand(tabId, 'Page.setInterceptFileChooserDialog', {
            enabled: true,
          });

          let fileChooserListener: ((source: any, method: string, params: any) => void) | null =
            null;
          try {
            const eventPromise = new Promise<any>((resolve, reject) => {
              const timer = setTimeout(() => {
                reject(
                  new Error(
                    `Timed out (8000ms) waiting for file chooser dialog after clicking index [${clickIndex}]`,
                  ),
                );
              }, 8000);

              fileChooserListener = (source: any, method: string, params: any) => {
                if (source?.tabId === tabId && method === 'Page.fileChooserOpened') {
                  clearTimeout(timer);
                  resolve(params);
                }
              };

              if (typeof chrome !== 'undefined' && chrome.debugger?.onEvent) {
                chrome.debugger.onEvent.addListener(fileChooserListener);
              }
            });

            // Resolve element coordinates first for trusted CDP mouse click
            let clicked = false;
            const coordResults = await executeInPage(
              { tabId, allFrames: true },
              'inPageGetElementCoordinates',
              [clickIndex],
            );
            const coord = coordResults?.find((r) => r.result?.success)?.result;
            if (coord?.x && coord?.y) {
              await cdpSessionManager.sendCommand(tabId, 'Input.dispatchMouseEvent', {
                type: 'mousePressed',
                x: coord.x,
                y: coord.y,
                button: 'left',
                clickCount: 1,
              });
              await cdpSessionManager.sendCommand(tabId, 'Input.dispatchMouseEvent', {
                type: 'mouseReleased',
                x: coord.x,
                y: coord.y,
                button: 'left',
                clickCount: 1,
              });
              clicked = true;
            } else {
              // Fallback to inPageInteractIndex click
              const clickResults = await executeInPage(
                { tabId, allFrames: true },
                'inPageInteractIndex',
                [clickIndex, 'click'],
              );
              clicked = Boolean(clickResults?.find((r) => r.result?.success));
            }

            if (!clicked) {
              throw new Error(
                `Target element with index [${clickIndex}] not found for file upload click trigger`,
              );
            }

            // Wait for file chooser opened event
            openedEvent = await eventPromise;
            if (!openedEvent || openedEvent.backendNodeId === undefined) {
              throw new Error('Page.fileChooserOpened fired without backendNodeId');
            }

            // Set files on the intercepted file chooser input
            await cdpSessionManager.sendCommand(tabId, 'DOM.setFileInputFiles', {
              files,
              backendNodeId: openedEvent.backendNodeId,
            });

            // Dispatch input and change events on the intercepted input node so reactive frameworks trigger upload
            try {
              const resolved = (await cdpSessionManager.sendCommand(tabId, 'DOM.resolveNode', {
                backendNodeId: openedEvent.backendNodeId,
              })) as { object?: { objectId?: string } };

              if (resolved?.object?.objectId) {
                await cdpSessionManager.sendCommand(tabId, 'Runtime.callFunctionOn', {
                  objectId: resolved.object.objectId,
                  functionDeclaration: `function() {
                    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                  }`,
                  returnByValue: true,
                });
                try {
                  await cdpSessionManager.sendCommand(tabId, 'Runtime.releaseObject', {
                    objectId: resolved.object.objectId,
                  });
                } catch {}
              }
            } catch (evErr) {
              console.warn('Failed to dispatch change event on intercepted file input:', evErr);
            }
          } finally {
            if (fileChooserListener && typeof chrome !== 'undefined' && chrome.debugger?.onEvent) {
              chrome.debugger.onEvent.removeListener(fileChooserListener);
            }
            try {
              await cdpSessionManager.sendCommand(tabId, 'Page.setInterceptFileChooserDialog', {
                enabled: false,
              });
            } catch {}
          }
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                mode: 'file_chooser_dialog_intercept',
                clickTargetIndex: clickIndex,
                backendNodeId: openedEvent?.backendNodeId,
                files,
              }),
            },
          ],
          isError: false,
        };
      }

      // Mode 2: Standard file input element (CDP DOM query + DOM.setFileInputFiles)

      // Use shared CDP session manager to attach/do work/detach safely
      await cdpSessionManager.withSession(tabId, 'file-upload', async () => {
        // Enable necessary CDP domains
        await cdpSessionManager.sendCommand(tabId, 'DOM.enable', {});
        await cdpSessionManager.sendCommand(tabId, 'Runtime.enable', {});

        // Get the document
        const { root } = (await cdpSessionManager.sendCommand(tabId, 'DOM.getDocument', {
          depth: -1,
          pierce: true,
        })) as { root: { nodeId: number } };

        // Find the file input element:
        // If index is provided, resolve directly via Isolated World memory map with ephemeral attribute bridge to CDP
        let targetNodeId = 0;
        if (typeof index === 'number' && index > 0) {
          const markerAttr = 'data-cdp-upload-' + Math.random().toString(36).slice(2, 10);
          try {
            const markScript = (targetIdx: number, marker: string) => {
              const map = (globalThis as any)[Symbol.for('__browser_use_isolated_index_map__')];
              const wrapped = map?.get(targetIdx);
              const el = wrapped?.deref ? wrapped.deref() : wrapped;
              if (el && el instanceof Element) {
                el.setAttribute(marker, '1');
                return true;
              }
              return false;
            };

            const markRes = await this.safeExecuteScript(tabId, {
              target: { tabId },
              func: markScript,
              args: [index, markerAttr],
            });

            let marked = markRes?.[0]?.result;
            if (!marked) {
              const frameMarkRes = await this.safeExecuteScript(tabId, {
                target: { tabId, allFrames: true },
                func: markScript,
                args: [index, markerAttr],
              });
              marked = frameMarkRes.some((r) => r.result);
            }

            if (marked) {
              const direct = (await cdpSessionManager.sendCommand(tabId, 'DOM.querySelector', {
                nodeId: root.nodeId,
                selector: `[${markerAttr}="1"]`,
              })) as { nodeId: number };
              if (direct?.nodeId && direct.nodeId > 0) {
                targetNodeId = direct.nodeId;
              }
            }
          } catch (evalErr) {
            console.warn(`Failed to resolve index [${index}] to CDP nodeId:`, evalErr);
          } finally {
            // Clean up ephemeral marker immediately so DOM is not polluted
            await this.safeExecuteScript(tabId, {
              target: { tabId, allFrames: true },
              func: (marker: string) => {
                document
                  .querySelectorAll(`[${marker}="1"]`)
                  .forEach((el) => el.removeAttribute(marker));
              },
              args: [markerAttr],
            }).catch(() => {});
          }
        }

        if ((!targetNodeId || targetNodeId === 0) && targetSelector) {
          try {
            const direct = (await cdpSessionManager.sendCommand(tabId, 'DOM.querySelector', {
              nodeId: root.nodeId,
              selector: targetSelector,
            })) as { nodeId: number };
            if (direct?.nodeId && direct.nodeId > 0) {
              targetNodeId = direct.nodeId;
            }
          } catch {}
        }

        if (!targetNodeId && targetSelector) {
          // Fallback: search for input[type="file"] inside or near selector
          try {
            const fallback = (await cdpSessionManager.sendCommand(tabId, 'DOM.querySelector', {
              nodeId: root.nodeId,
              selector: `${targetSelector} input[type="file"], input[type="file"]`,
            })) as { nodeId: number };
            if (fallback?.nodeId) {
              targetNodeId = fallback.nodeId;
            }
          } catch {}
        }

        if (!targetNodeId || targetNodeId === 0) {
          throw new Error(
            `Element with ${index ? `index [${index}]` : `selector "${targetSelector}"`} not found. ${DIAGNOSTIC_REFRESH_GUIDANCE}`,
          );
        }

        // Verify it's an input element, or find child file input if it is a wrapper
        let { node } = (await cdpSessionManager.sendCommand(tabId, 'DOM.describeNode', {
          nodeId: targetNodeId,
        })) as { node: { nodeName: string; attributes?: string[] } };

        if (node.nodeName !== 'INPUT') {
          try {
            const childInput = (await cdpSessionManager.sendCommand(tabId, 'DOM.querySelector', {
              nodeId: targetNodeId,
              selector: 'input[type="file"]',
            })) as { nodeId: number };
            if (childInput?.nodeId && childInput.nodeId > 0) {
              targetNodeId = childInput.nodeId;
              const desc = (await cdpSessionManager.sendCommand(tabId, 'DOM.describeNode', {
                nodeId: targetNodeId,
              })) as { node: { nodeName: string; attributes?: string[] } };
              if (desc?.node) node = desc.node;
            }
          } catch {}
        }

        // Set the files on the input element using CDP DOM.setFileInputFiles
        await cdpSessionManager.sendCommand(tabId, 'DOM.setFileInputFiles', {
          nodeId: targetNodeId,
          files,
        });

        // Trigger input and change events directly on the target node via DOM.resolveNode
        // to ensure isolated context, sub-frames, and shadow DOM receive events accurately
        try {
          const resolved = (await cdpSessionManager.sendCommand(tabId, 'DOM.resolveNode', {
            nodeId: targetNodeId,
          })) as { object?: { objectId?: string } };

          if (resolved?.object?.objectId) {
            await cdpSessionManager.sendCommand(tabId, 'Runtime.callFunctionOn', {
              objectId: resolved.object.objectId,
              functionDeclaration: `function() {
                this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
              }`,
              returnByValue: true,
            });
            try {
              await cdpSessionManager.sendCommand(tabId, 'Runtime.releaseObject', {
                objectId: resolved.object.objectId,
              });
            } catch {}
          } else {
            // Fallback to top-level querySelector if resolveNode failed
            const selectorStr = targetSelector
              ? targetSelector.replace(/'/g, "\\'")
              : 'input[type="file"]';
            await cdpSessionManager.sendCommand(tabId, 'Runtime.evaluate', {
              expression: `
                (function() {
                  const element = document.querySelector('${selectorStr}') || document.querySelector('input[type="file"]');
                  if (element) {
                    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                  }
                })()
              `,
            });
          }
        } catch (evErr) {
          console.warn('Failed to dispatch input/change events on file input:', evErr);
        }
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'File(s) uploaded successfully',
              files: files,
              selector: targetSelector,
              index: index,
              fileCount: files.length,
            }),
          },
        ],
        isError: false,
      };
    } catch (error) {
      console.error('Error in file upload operation:', error);
      return createErrorResponse(
        `Error uploading file: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      // Clean up temporary files created from URL or base64 data
      if (createdTempFiles.length > 0) {
        for (const tempPath of createdTempFiles) {
          try {
            await this.cleanupTempFile(tempPath);
          } catch (cleanErr) {
            console.warn(`Failed to cleanup temp upload file: ${tempPath}`, cleanErr);
          }
        }
      }
    }
  }

  // All debugger attach/detach is centrally managed by cdpSessionManager

  /**
   * Prepare file from URL or base64 data using native messaging host
   */
  private async prepareFileFromRemote(options: {
    fileUrl?: string;
    base64Data?: string;
    fileName: string;
  }): Promise<{ filePath?: string; error?: string }> {
    const { fileUrl, base64Data, fileName } = options;

    return new Promise((resolve) => {
      const requestId = `prep-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const timeout = setTimeout(() => {
        cancelFileOperation(requestId);
        resolve({ error: 'File preparation request timed out after 30 seconds' });
      }, 30000); // 30 second timeout

      const ok = sendFileOperationToNative(
        {
          type: 'file_operation',
          requestId,
          payload: {
            action: 'prepareFile',
            fileUrl,
            base64Data,
            fileName,
          },
        },
        (message: any) => {
          clearTimeout(timeout);
          if (message.payload?.success && message.payload?.filePath) {
            resolve({ filePath: message.payload.filePath });
          } else {
            const err =
              message.error || message.payload?.error || 'Native host failed to prepare file';
            console.error('Native host failed to prepare file:', err);
            resolve({ error: err });
          }
        },
      );

      if (!ok) {
        clearTimeout(timeout);
        resolve({ error: 'Failed to communicate with native host: Native host not connected' });
      }
    });
  }

  /**
   * Request native host to delete a temporary upload file
   */
  private async cleanupTempFile(filePath: string): Promise<void> {
    return new Promise((resolve) => {
      const requestId = `cleanup-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const timeout = setTimeout(() => resolve(), 5000);

      const ok = sendFileOperationToNative(
        {
          type: 'file_operation',
          requestId,
          payload: {
            action: 'cleanupFile',
            filePath,
          },
        },
        () => {
          clearTimeout(timeout);
          resolve();
        },
      );

      if (!ok) {
        clearTimeout(timeout);
        resolve();
      }
    });
  }
}

export const fileUploadTool = new FileUploadTool();
