import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'chrome-mcp-shared';
import { TOOL_MESSAGE_TYPES } from '@/common/message-types';
import {
  canvasToDataURL,
  createImageBitmapFromUrl,
  cropAndResizeImage,
  stitchImages,
  compressImage,
  overlayCoordinateGrid,
} from '../../../../utils/image-utils';
import { screenshotContextManager } from '@/utils/screenshot-context';
import { executeInPage } from './in-page-engine';
import { screenshotRingBuffer } from '@/utils/screenshot-ring-buffer';
import { isRestrictedChromeUrl } from '@/utils/restricted-url';

// Screenshot-specific constants
const SCREENSHOT_CONSTANTS = {
  SCROLL_DELAY_MS: 350, // Time to wait after scroll for rendering and lazy loading
  CAPTURE_STITCH_DELAY_MS: 50, // Small delay between captures in a scroll sequence
  MAX_CAPTURE_PARTS: 50, // Maximum number of parts to capture (for infinite scroll pages)
  MAX_CAPTURE_HEIGHT_PX: 50000, // Maximum height in pixels to capture
  PIXEL_TOLERANCE: 1,
  SCRIPT_INIT_DELAY: 100, // Delay for script initialization
} as {
  readonly SCROLL_DELAY_MS: number;
  CAPTURE_STITCH_DELAY_MS: number; // This one is mutable
  readonly MAX_CAPTURE_PARTS: number;
  readonly MAX_CAPTURE_HEIGHT_PX: number;
  readonly PIXEL_TOLERANCE: number;
  readonly SCRIPT_INIT_DELAY: number;
};

// Adjust CAPTURE_STITCH_DELAY_MS to respect Chrome's capture rate if available in runtime
// Some TS typings don't expose MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND; use a safe cast with a sane fallback.
const __MAX_CAP_RATE: number | undefined = (chrome.tabs as any)
  ?.MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND;
if (typeof __MAX_CAP_RATE === 'number' && __MAX_CAP_RATE > 0) {
  // Minimum interval between consecutive captureVisibleTab calls (ms)
  const minIntervalMs = Math.ceil(1000 / __MAX_CAP_RATE);
  // Our capture loop already waits SCROLL_DELAY_MS between scroll and capture; add any extra delay needed
  const requiredExtraDelay = Math.max(0, minIntervalMs - SCREENSHOT_CONSTANTS.SCROLL_DELAY_MS);
  SCREENSHOT_CONSTANTS.CAPTURE_STITCH_DELAY_MS = Math.max(
    requiredExtraDelay,
    SCREENSHOT_CONSTANTS.CAPTURE_STITCH_DELAY_MS,
  );
}

interface ScreenshotToolParams {
  name?: string;
  selector?: string;
  targetIndex?: number;
  padding?: number;
  format?: 'png' | 'jpeg' | 'webp';
  quality?: number; // 0-100
  tabId?: number;
  background?: boolean;
  windowId?: number;
  width?: number;
  height?: number;
  storeBase64?: boolean;
  fullPage?: boolean;
  savePng?: boolean;
  maxHeight?: number; // Maximum height to capture in pixels (for infinite scroll pages)
  grid?: boolean; // Overlay semi-transparent coordinate reference grid
  expandSearchArea?: boolean; // Adaptively expand crop box for small elements (<100x100)
  autoExpand?: boolean;
  som?: boolean; // Overlay Set-of-Mark numbered badges on interactive elements before capture
  highlight?: boolean; // Alias for som
  setOfMark?: boolean; // Alias for som
  /** View a single visual asset listed by chrome_read_dom (1-based asset index). Bytes first, viewport-crop fallback */
  assetIndex?: number;
  sessionId?: string;
  sessionContext?: string;
}

/** Page details returned by screenshot-helper content script */
interface ScreenshotPageDetails {
  totalWidth: number;
  totalHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  currentScrollX: number;
  currentScrollY: number;
}

const PAGE_DETAILS_REQUIRED_FIELDS: Array<keyof ScreenshotPageDetails> = [
  'totalWidth',
  'totalHeight',
  'viewportWidth',
  'viewportHeight',
  'devicePixelRatio',
  'currentScrollX',
  'currentScrollY',
];

/**
 * Validates and asserts that the response from content script contains valid page details
 */
function assertValidPageDetails(details: unknown): ScreenshotPageDetails {
  if (!details || typeof details !== 'object') {
    throw new Error(
      'Screenshot helper did not respond. The content script may not be injected or cannot run on this page.',
    );
  }

  const candidate = details as Partial<ScreenshotPageDetails>;
  const invalidFields = PAGE_DETAILS_REQUIRED_FIELDS.filter(
    (field) => typeof candidate[field] !== 'number' || !Number.isFinite(candidate[field]),
  );

  if (invalidFields.length > 0) {
    throw new Error(
      `Screenshot helper returned invalid page details (missing/invalid: ${invalidFields.join(', ')}).`,
    );
  }

  return candidate as ScreenshotPageDetails;
}

/**
 * Enforce DPR 1:1 geometric alignment by resampling captured image to exact CSS viewport dimensions.
 * Eliminates physical coordinate drift across arbitrary display scaling (125%, 150%, 200%).
 */
async function normalizeImageToCssDimensions(
  dataUrl: string,
  targetWidthCss: number,
  targetHeightCss: number,
  mimeType: string = 'image/webp',
  quality: number = 0.8,
): Promise<string> {
  const img = await createImageBitmapFromUrl(dataUrl);
  if (
    img.width === targetWidthCss &&
    img.height === targetHeightCss &&
    dataUrl.startsWith(`data:${mimeType}`)
  ) {
    return dataUrl;
  }
  const canvas = new OffscreenCanvas(targetWidthCss, targetHeightCss);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2D context from OffscreenCanvas');
  ctx.drawImage(img, 0, 0, targetWidthCss, targetHeightCss);
  return await canvasToDataURL(canvas, mimeType, quality);
}

/**
 * Detect window-transition black bars (right/bottom edges fully near-black).
 * Samples 1px lines at the right and bottom edges; >92% black on EITHER edge
 * after activation means the compositor had not presented the real frame.
 */
async function hasBlackBars(dataUrl: string): Promise<boolean> {
  try {
    const img = await createImageBitmapFromUrl(dataUrl);
    const w = img.width,
      h = img.height;
    if (w < 64 || h < 64) return false;
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0);
    const sample = (edge: 'right' | 'bottom'): number => {
      const count = edge === 'right' ? 48 : 48;
      let black = 0;
      for (let i = 0; i < count; i++) {
        const x = edge === 'right' ? w - 1 : Math.floor((i / count) * w);
        const y = edge === 'bottom' ? h - 1 : Math.floor((i / count) * h);
        const d = ctx.getImageData(x, y, 1, 1).data;
        if (d[0] + d[1] + d[2] < 18) black++;
      }
      return black / count;
    };
    const right = sample('right');
    const bottom = sample('bottom');
    return right > 0.92 || bottom > 0.92;
  } catch {
    return false;
  }
}

/**
 * Tool for capturing screenshots of web pages
 */
class ScreenshotTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.SCREENSHOT;

  /**
   * Execute screenshot operation
   */
  async execute(args: ScreenshotToolParams): Promise<ToolResult> {
    const {
      name = 'screenshot',
      selector,
      storeBase64 = false,
      fullPage = false,
      savePng = false,
      format = args.format || 'webp',
    } = args;

    console.log(`Starting screenshot with options:`, args);

    // Resolve target tab with Session Tab Affinity support
    const tab = await this.resolveAffinityTab({
      tabId: args.tabId,
      windowId: args.windowId,
      sessionId: args.sessionId || args.sessionContext,
    });

    // Check URL restrictions (shared with every content-script tool)
    if (isRestrictedChromeUrl(tab.url)) {
      return createErrorResponse(
        'Cannot capture special browser pages or web store pages due to security restrictions.',
      );
    }

    let finalImageDataUrl: string | undefined;
    let finalImageWidthCss: number | undefined;
    let finalImageHeightCss: number | undefined;
    const results: any = { base64: null, fileSaved: false };
    let originalScroll: { x: number; y: number } | null = null;
    let didPreparePage = false;
    let didInjectSoM = false;
    let pageDetails: ScreenshotPageDetails | undefined;

    let elementCropOrigin: { x: number; y: number } | undefined;

    try {
      const enableSoM = args.som === true || args.highlight === true || args.setOfMark === true;
      if (enableSoM) {
        try {
          const somResults = await executeInPage(
            { tabId: tab.id!, allFrames: true },
            'inPageDOMPruner',
            [{ highlight: true }],
          );
          didInjectSoM = true;

          // Reindex subframe badges so they match global monotonic indices from chrome_read_dom
          if (Array.isArray(somResults) && somResults.length > 1) {
            const mainFrame = somResults.find((r) => r.frameId === 0) || somResults[0];
            let currentIndex = (mainFrame?.result?.indexedElements?.length || 0) + 1;

            for (const r of somResults) {
              if (r === mainFrame || !r.result) continue;
              const subCount = r.result.indexedElements?.length || 0;
              if (subCount > 0 && r.frameId !== undefined) {
                const frameOffset = currentIndex - 1;
                currentIndex += subCount;
                try {
                  await executeInPage(
                    { tabId: tab.id!, frameIds: [r.frameId] },
                    'inPageReindexFrame',
                    [frameOffset, true],
                  );
                } catch (reindexErr) {
                  console.warn(
                    `Failed to reindex subframe ${r.frameId} for screenshot:`,
                    reindexErr,
                  );
                }
              }
            }
          }
        } catch (somErr) {
          console.warn('Failed to render Set-of-Mark badges for screenshot:', somErr);
        }
      }

      const background = args.background === true;
      const targetMimeType =
        format === 'webp' ? 'image/webp' : format === 'jpeg' ? 'image/jpeg' : 'image/png';
      const qualityFraction =
        typeof args.quality === 'number' ? Math.max(0, Math.min(1, args.quality / 100)) : 0.8;

      // === Path 0: named asset (from chrome_read_dom assets[]) ===
      // Primary: fetch real bytes in page (canvas toDataURL / img+bg fetch).
      // Fallback: crop the viewport capture by the asset rect.
      let assetHandled = false;
      if (typeof args.assetIndex === 'number') {
        const assetResults = await executeInPage(
          { tabId: tab.id!, allFrames: true },
          'inPageGetAssetImage',
          [args.assetIndex],
        );
        const asset = assetResults?.find((r) => r.result)?.result;
        if (!asset?.rect) {
          return createErrorResponse(
            asset?.reason ||
              `Asset ${args.assetIndex} not found. Run chrome_read_dom to list assets.`,
          );
        }
        if (asset.dataUrl && asset.dataUrl.startsWith('data:')) {
          finalImageDataUrl = asset.dataUrl;
          const img = await createImageBitmapFromUrl(asset.dataUrl);
          finalImageWidthCss = img.width;
          finalImageHeightCss = img.height;
          assetHandled = true;
          results.assetKind = asset.kind;
          results.assetSrc = asset.src;
          results.assetSource = 'bytes';
        } else {
          // Fallback: viewport crop of the asset rect (DPR-scaled)
          const dpr = pageDetails?.devicePixelRatio || 1;
          const pad = Math.max(0, args.padding ?? 0);
          const crop = {
            x: Math.max(0, Math.round((asset.rect.x - pad) * dpr)),
            y: Math.max(0, Math.round((asset.rect.y - pad) * dpr)),
            w: Math.round((asset.rect.width + pad * 2) * dpr),
            h: Math.round((asset.rect.height + pad * 2) * dpr),
          };
          const visibleDataUrl = await this.captureTabPng(tab);
          if (!visibleDataUrl)
            throw new Error('captureTabPng returned empty image (asset fallback)');
          const cropped = new OffscreenCanvas(crop.w, crop.h);
          const cctx = cropped.getContext('2d');
          if (!cctx) throw new Error('OffscreenCanvas 2d context failed (asset fallback)');
          const raw = await createImageBitmapFromUrl(visibleDataUrl);
          cctx.drawImage(raw, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
          finalImageDataUrl = await canvasToDataURL(
            cropped,
            targetMimeType as any,
            qualityFraction,
          );
          finalImageWidthCss = crop.w;
          finalImageHeightCss = crop.h;
          assetHandled = true;
          results.assetKind = asset.kind;
          results.assetSrc = asset.src;
          results.assetSource = 'viewport-crop';
          results.assetFallbackReason = asset.reason;
        }
      }

      // CDP path: simple viewport capture (no fullPage, no selector, no targetIndex, no som)
      const canUseCdpCapture =
        !assetHandled &&
        !fullPage &&
        !selector &&
        typeof args.targetIndex !== 'number' &&
        !enableSoM;

      // === Path 1: CDP viewport capture (no content script needed) ===
      if (canUseCdpCapture) {
        try {
          const tabId = tab.id!;
          const { cdpSessionManager } = await import('@/utils/cdp-session-manager');
          await cdpSessionManager.withSession(tabId, 'screenshot', async () => {
            // Wait two compositor frames so a just-activated/just-navigated
            // tab has presented its real content; otherwise captureScreenshot
            // races the window-transition frame and returns black bars.
            try {
              if (tab.active) {
                const rafPromise = cdpSessionManager.sendCommand(tabId, 'Runtime.evaluate', {
                  expression:
                    'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))',
                  awaitPromise: true,
                });
                await Promise.race([rafPromise, new Promise((r) => setTimeout(r, 300))]);
              } else {
                await new Promise((r) => setTimeout(r, 50));
              }
            } catch (rafErr) {
              console.warn('rAF settle wait failed (capturing anyway):', rafErr);
            }
            const metrics: any = await cdpSessionManager.sendCommand(
              tabId,
              'Page.getLayoutMetrics',
              {},
            );
            const viewport = metrics?.cssVisualViewport ||
              metrics?.cssLayoutViewport ||
              metrics?.layoutViewport ||
              metrics?.visualViewport || {
                clientWidth: 800,
                clientHeight: 600,
                pageX: 0,
                pageY: 0,
              };
            const cdpFormat = format === 'webp' ? 'webp' : format === 'png' ? 'png' : 'jpeg';
            const cdpQuality =
              (cdpFormat === 'jpeg' || cdpFormat === 'webp') && typeof args.quality === 'number'
                ? Math.max(0, Math.min(100, Math.round(args.quality)))
                : cdpFormat === 'jpeg' || cdpFormat === 'webp'
                  ? 80
                  : undefined;

            const clientWidth = Math.round(viewport.clientWidth || 800);
            const clientHeight = Math.round(viewport.clientHeight || 600);

            const shot: any = await cdpSessionManager.sendCommand(tabId, 'Page.captureScreenshot', {
              format: cdpFormat,
              quality: cdpQuality,
              captureBeyondViewport: false,
              fromSurface: true,
              clip: {
                x: viewport.pageX || 0,
                y: viewport.pageY || 0,
                width: clientWidth,
                height: clientHeight,
                scale: 1,
              },
            });
            const base64Data = typeof shot?.data === 'string' ? shot.data : '';
            if (!base64Data) {
              throw new Error('CDP Page.captureScreenshot returned empty data');
            }
            const rawDataUrl = `data:${shot.mimeType || targetMimeType};base64,${base64Data}`;
            // Enforce DPR 1:1 normalization via OffscreenCanvas
            finalImageDataUrl = await normalizeImageToCssDimensions(
              rawDataUrl,
              clientWidth,
              clientHeight,
              targetMimeType,
              qualityFraction,
            );
            finalImageWidthCss = clientWidth;
            finalImageHeightCss = clientHeight;
            if (await hasBlackBars(finalImageDataUrl)) {
              // Window-transition frame: wait two more presented frames and
              // retry exactly once before accepting the capture.
              await new Promise((r) => setTimeout(r, 250));
              try {
                await cdpSessionManager.sendCommand(tabId, 'Runtime.evaluate', {
                  expression:
                    'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))',
                  awaitPromise: true,
                });
              } catch {}
              const retry: any = await cdpSessionManager.sendCommand(
                tabId,
                'Page.captureScreenshot',
                {
                  format: cdpFormat,
                  quality: cdpQuality,
                  captureBeyondViewport: false,
                  fromSurface: true,
                  clip: {
                    x: viewport.pageX || 0,
                    y: viewport.pageY || 0,
                    width: clientWidth,
                    height: clientHeight,
                    scale: 1,
                  },
                },
              );
              const retryData = typeof retry?.data === 'string' ? retry.data : '';
              if (retryData) {
                finalImageDataUrl = await normalizeImageToCssDimensions(
                  `data:${retry.mimeType || targetMimeType};base64,${retryData}`,
                  clientWidth,
                  clientHeight,
                  targetMimeType,
                  qualityFraction,
                );
              }
            }
          });
        } catch (e) {
          console.warn('CDP viewport capture failed, falling back to helper path:', e);
        }
      }

      // === Path 2: Helper-assisted capture (requires content script) ===
      if (!assetHandled && !finalImageDataUrl) {
        // Always inject helper when we need pageDetails
        await this.injectContentScript(tab.id!, ['inject-scripts/screenshot-helper.js']);
        await new Promise((resolve) => setTimeout(resolve, SCREENSHOT_CONSTANTS.SCRIPT_INIT_DELAY));

        // Prepare page (hide scrollbars, handle fixed elements)
        // Helper messages can die with a stale listener after extension
        // reloads or renderer swaps. One re-inject + retry recovers them;
        // a second failure surfaces as the original error.
        const prepareResp = await this.sendToHelperWithRetry(tab.id!, {
          action: TOOL_MESSAGE_TYPES.SCREENSHOT_PREPARE_PAGE_FOR_CAPTURE,
          options: { fullPage },
        });
        if (!prepareResp || prepareResp.success !== true) {
          throw new Error(
            'Screenshot helper did not acknowledge page preparation. The content script may not be injected or cannot run on this page.',
          );
        }
        didPreparePage = true;

        // Get page details with validation
        const rawPageDetails = await this.sendToHelperWithRetry(tab.id!, {
          action: TOOL_MESSAGE_TYPES.SCREENSHOT_GET_PAGE_DETAILS,
        });
        pageDetails = assertValidPageDetails(rawPageDetails);
        originalScroll = { x: pageDetails.currentScrollX, y: pageDetails.currentScrollY };

        if (fullPage) {
          this.logInfo('Capturing full page...');
          finalImageDataUrl = await this._captureFullPage(tab.id!, args, pageDetails, tab.windowId);
          if (format !== 'png') {
            const converted = await compressImage(finalImageDataUrl, {
              scale: 1.0,
              quality: qualityFraction,
              format: targetMimeType as any,
            });
            finalImageDataUrl = converted.dataUrl;
          }
          // Compute final CSS size
          if (args.width && args.height) {
            finalImageWidthCss = args.width;
            finalImageHeightCss = args.height;
          } else if (args.width && !args.height) {
            finalImageWidthCss = args.width;
            const ratio = pageDetails.totalHeight / pageDetails.totalWidth;
            finalImageHeightCss = Math.round(args.width * ratio);
          } else if (!args.width && args.height) {
            finalImageHeightCss = args.height;
            const ratio = pageDetails.totalWidth / pageDetails.totalHeight;
            finalImageWidthCss = Math.round(args.height * ratio);
          } else {
            finalImageWidthCss = pageDetails.totalWidth;
            finalImageHeightCss = pageDetails.totalHeight;
          }
        } else if (selector || typeof args.targetIndex === 'number') {
          this.logInfo(`Capturing element (selector=${selector}, targetIndex=${args.targetIndex})`);
          const elementCapture = await this._captureElement(
            tab.id!,
            args,
            pageDetails.devicePixelRatio,
            tab.windowId,
          );
          finalImageDataUrl = elementCapture.dataUrl;
          finalImageWidthCss = elementCapture.widthCss;
          finalImageHeightCss = elementCapture.heightCss;
          elementCropOrigin = { x: elementCapture.originX, y: elementCapture.originY };
        } else {
          // Visible area only
          this.logInfo('Capturing visible area...');
          const rawVisibleDataUrl = await this.captureTabPng(tab);
          if (!rawVisibleDataUrl) throw new Error('captureVisibleTab returned empty image');
          // Enforce DPR 1:1 Normalization: resample from physical pixels to exact CSS viewport dimensions
          finalImageDataUrl = await normalizeImageToCssDimensions(
            rawVisibleDataUrl,
            pageDetails.viewportWidth,
            pageDetails.viewportHeight,
            targetMimeType,
            qualityFraction,
          );
          finalImageWidthCss = pageDetails.viewportWidth;
          finalImageHeightCss = pageDetails.viewportHeight;
        }
      }

      if (!finalImageDataUrl) {
        throw new Error('Failed to capture image data');
      }

      // 1.5. Coordinate reference grid overlay
      if (args.grid === true && finalImageDataUrl) {
        try {
          // Output canvas is 1:1 normalized to CSS pixels, so effective DPR is 1
          finalImageDataUrl = await overlayCoordinateGrid(
            finalImageDataUrl,
            1,
            100,
            targetMimeType,
            qualityFraction,
          );
        } catch (gridErr) {
          console.warn('Failed to overlay coordinate reference grid on screenshot:', gridErr);
        }
      }

      // 2. Process output
      // Update screenshot context for coordinate scaling by tools like chrome_computer
      try {
        if (typeof finalImageWidthCss === 'number' && typeof finalImageHeightCss === 'number') {
          let hostname = '';
          try {
            hostname = tab.url ? new URL(tab.url).hostname : '';
          } catch {
            // ignore
          }
          // For element captures, keep viewport bounds localized to element dimensions with origin offset
          const viewportWidth = elementCropOrigin
            ? finalImageWidthCss
            : (pageDetails?.viewportWidth ?? finalImageWidthCss);
          const viewportHeight = elementCropOrigin
            ? finalImageHeightCss
            : (pageDetails?.viewportHeight ?? finalImageHeightCss);
          screenshotContextManager.setContext(tab.id!, {
            screenshotWidth: finalImageWidthCss,
            screenshotHeight: finalImageHeightCss,
            viewportWidth,
            viewportHeight,
            originX: elementCropOrigin?.x,
            originY: elementCropOrigin?.y,
            devicePixelRatio: pageDetails?.devicePixelRatio,
            hostname,
          });
        }
      } catch (e) {
        console.warn('Failed to set screenshot context:', e);
      }

      const shouldSaveDisk = savePng === true || (args as any).saveToDisk === true;
      if (shouldSaveDisk) {
        // Save file to downloads
        this.logInfo(`Saving ${format.toUpperCase()}...`);
        try {
          const ext = format === 'webp' ? 'webp' : format === 'jpeg' ? 'jpg' : 'png';
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const filename = `${name.replace(/[^a-z0-9_-]/gi, '_') || 'screenshot'}_${timestamp}.${ext}`;

          // Use Chrome's download API to save the file
          const downloadId = await chrome.downloads.download({
            url: finalImageDataUrl,
            filename: filename,
            saveAs: false,
          });

          results.downloadId = downloadId;
          results.filename = filename;
          results.fileSaved = true;

          // Try to get the full file path
          try {
            // Wait a moment to ensure download info is updated
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Search for download item to get full path
            const [downloadItem] = await chrome.downloads.search({ id: downloadId });
            if (downloadItem && downloadItem.filename) {
              // Add full path to response
              results.fullPath = downloadItem.filename;
            }
          } catch (pathError) {
            console.warn('Could not get full file path:', pathError);
          }
        } catch (error) {
          console.error('Error saving PNG file:', error);
          results.saveError = String(error instanceof Error ? error.message : error);
        }
      }
    } catch (error) {
      console.error('Error during screenshot execution:', error);
      return createErrorResponse(
        `Screenshot error: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
      );
    } finally {
      // 3. Reset page only if we prepared it
      if (didPreparePage) {
        try {
          // Only include scroll position if we successfully captured it
          const resetMessage: Record<string, unknown> = {
            action: TOOL_MESSAGE_TYPES.SCREENSHOT_RESET_PAGE_AFTER_CAPTURE,
          };
          if (originalScroll) {
            resetMessage.scrollX = originalScroll.x;
            resetMessage.scrollY = originalScroll.y;
          }
          await this.sendMessageToTab(tab.id!, resetMessage);
        } catch (err) {
          console.warn('Failed to reset page, tab might have closed:', err);
        }
      }

      // 4. Remove Set-of-Mark overlay if we injected it for screenshot
      if (didInjectSoM && tab.id) {
        try {
          const { inPageRemoveHighlights } = await import('./dom-indexer');
          await this.safeExecuteScript(tab.id, {
            target: { tabId: tab.id, allFrames: true },
            func: inPageRemoveHighlights,
          });
        } catch (err) {
          console.warn('Failed to remove Set-of-Mark highlights after screenshot:', err);
        }
      }
    }

    this.logInfo('Screenshot completed!');

    let finalBase64 =
      results.base64 ||
      (finalImageDataUrl ? finalImageDataUrl.replace(/^data:[^;]+;base64,/, '') : undefined);
    let finalMime: 'image/webp' | 'image/png' | 'image/jpeg' =
      format === 'webp' ? 'image/webp' : format === 'png' ? 'image/png' : 'image/jpeg';
    let isThumbnailFinal = false;

    if (finalBase64 && finalBase64.length > 450 * 1024 && finalImageDataUrl) {
      try {
        const scaleRatio = Math.min(
          0.75,
          Math.max(0.2, Math.sqrt((350 * 1024) / finalBase64.length)),
        );
        const thumb = await compressImage(finalImageDataUrl, {
          scale: scaleRatio,
          quality: 0.75,
          format: finalMime,
        });
        const thumbBase64 = thumb.dataUrl.replace(/^data:image\/[^;]+;base64,/, '');
        if (thumbBase64.length < 800 * 1024) {
          finalBase64 = thumbBase64;
          finalMime = thumb.mimeType as 'image/png' | 'image/jpeg' | 'image/webp';
          isThumbnailFinal = true;
        }
      } catch (thumbErr) {
        console.warn('Failed to generate preview thumbnail in final return:', thumbErr);
      }
    }

    delete results.base64;
    const base64Data = finalBase64;

    const returnContent: any[] = [
      {
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: `Screenshot [${name}] captured successfully`,
          tabId: tab.id,
          url: tab.url,
          name: name,
          format,
          quality: args.quality ?? (format === 'png' ? undefined : 80),
          targetIndex: args.targetIndex,
          padding: args.padding,
          selector: args.selector,
          assetIndex: args.assetIndex,
          grid: Boolean(args.grid),
          somApplied: didInjectSoM,
          ...(storeBase64 === true ? { base64Data } : {}),
          ...results,
          ...(isThumbnailFinal
            ? {
                isThumbnail: true,
                warning:
                  'Payload exceeded 450KB safety budget. High-quality preview thumbnail returned inline; nothing written to disk (pass savePng to save explicitly).',
              }
            : {}),
        }),
      },
    ];

    if (finalBase64) {
      returnContent.push({
        type: 'image',
        data: finalBase64,
        mimeType: finalMime,
      });
      screenshotRingBuffer.push({
        tabId: tab.id!,
        mimeType: finalMime,
        width: finalImageWidthCss || 800,
        height: finalImageHeightCss || 600,
        dataBase64: finalBase64,
      });
    }

    return {
      content: returnContent,
      isError: false,
    };
  }

  /**
   * Log information
   */
  private logInfo(message: string) {
    console.log(`[Screenshot Tool] ${message}`);
  }

  /**
   * Capture specific element by selector or compact 1-based index
   */
  /**
   * Send a screenshot-helper message; on timeout/no-answer, re-inject the
   * helper once and retry (stale isolated-world listener after extension
   * reload is the common case).
   */
  private async sendToHelperWithRetry(tabId: number, message: any): Promise<any> {
    try {
      return await this.sendMessageToTab(tabId, message);
    } catch (firstErr) {
      console.warn(
        `screenshot helper no answer for ${message?.action}; re-injecting once`,
        firstErr instanceof Error ? firstErr.message : firstErr,
      );
      await this.injectContentScript(tabId, ['inject-scripts/screenshot-helper.js']);
      await new Promise((resolve) => setTimeout(resolve, SCREENSHOT_CONSTANTS.SCRIPT_INIT_DELAY));
      return this.sendMessageToTab(tabId, message);
    }
  }

  private async captureTabPng(tab: chrome.tabs.Tab): Promise<string> {
    if (!tab.active && tab.id) {
      // For background tabs, captureVisibleTab would capture whatever tab is currently active
      // in the window, causing an active window data leak. Use CDP Page.captureScreenshot instead.
      const tabId = tab.id;
      const { cdpSessionManager } = await import('@/utils/cdp-session-manager');
      const shot: any = await cdpSessionManager.withSession(tabId, 'screenshot-bg', async () => {
        return await cdpSessionManager.sendCommand(tabId, 'Page.captureScreenshot', {
          format: 'png',
          fromSurface: true,
        });
      });
      if (!shot?.data)
        throw new Error('CDP captureScreenshot returned empty data for background tab');
      return `data:image/png;base64,${shot.data}`;
    }

    const dataUrl =
      typeof tab.windowId === 'number'
        ? await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' })
        : await chrome.tabs.captureVisibleTab({ format: 'png' });
    if (!dataUrl) throw new Error('captureVisibleTab returned empty image');
    return dataUrl;
  }

  async _captureElement(
    tabId: number,
    options: ScreenshotToolParams,
    pageDpr: number,
    windowId?: number,
  ): Promise<{
    dataUrl: string;
    widthCss: number;
    heightCss: number;
    originX: number;
    originY: number;
  }> {
    let cropRectPx: { x: number; y: number; width: number; height: number };
    let dpr = pageDpr || 1;

    if (typeof options.targetIndex === 'number') {
      const results = await executeInPage({ tabId, allFrames: true }, 'inPageGetIndexCropRect', [
        options.targetIndex,
        options.padding ?? 0,
        options.expandSearchArea ?? options.autoExpand ?? true,
      ]);
      const match = results?.find((r) => r.result?.success);
      const outcome = match?.result;
      if (!outcome?.success || !outcome.rect) {
        throw new Error(
          outcome?.error || `Element with index [${options.targetIndex}] not found for screenshot`,
        );
      }
      dpr = outcome.devicePixelRatio || pageDpr || 1;
      cropRectPx = {
        x: Math.round(outcome.rect.x * dpr),
        y: Math.round(outcome.rect.y * dpr),
        width: Math.round(outcome.rect.width * dpr),
        height: Math.round(outcome.rect.height * dpr),
      };
    } else {
      const elementDetails = await this.sendToHelperWithRetry(tabId, {
        action: TOOL_MESSAGE_TYPES.SCREENSHOT_GET_ELEMENT_DETAILS,
        selector: options.selector,
      });

      dpr = elementDetails.devicePixelRatio || pageDpr || 1;
      const pad = Math.max(0, options.padding ?? 0);
      cropRectPx = {
        x: Math.max(0, Math.round((elementDetails.rect.x - pad) * dpr)),
        y: Math.max(0, Math.round((elementDetails.rect.y - pad) * dpr)),
        width: Math.round((elementDetails.rect.width + pad * 2) * dpr),
        height: Math.round((elementDetails.rect.height + pad * 2) * dpr),
      };
    }

    // Re-align Set-of-Mark visual badges overlay after implicit scrollIntoView (for targetIndex and selector)
    const enableSoM =
      options.som === true || options.highlight === true || options.setOfMark === true;
    if (enableSoM) {
      try {
        await executeInPage({ tabId, allFrames: true }, 'inPageRealignHighlights', []);
      } catch {}
    }

    // Small delay to ensure element is fully rendered after scrollIntoView
    await new Promise((resolve) => setTimeout(resolve, SCREENSHOT_CONSTANTS.SCRIPT_INIT_DELAY));

    const targetTab = await chrome.tabs.get(tabId).catch(() => null);
    const visibleCaptureDataUrl = targetTab
      ? await this.captureTabPng(targetTab)
      : typeof windowId === 'number'
        ? await chrome.tabs.captureVisibleTab(windowId, { format: 'png' })
        : await chrome.tabs.captureVisibleTab({ format: 'png' });
    if (!visibleCaptureDataUrl) {
      throw new Error('Failed to capture visible tab for element cropping');
    }

    // DPR 1:1 Normalization: enforce output dimensions to exact CSS pixel dimensions
    const finalWidthCss = options.width ?? Math.max(1, Math.round(cropRectPx.width / dpr));
    const finalHeightCss = options.height ?? Math.max(1, Math.round(cropRectPx.height / dpr));

    const croppedCanvas = new OffscreenCanvas(finalWidthCss, finalHeightCss);
    const ctx = croppedCanvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context from OffscreenCanvas');

    const rawImg = await createImageBitmapFromUrl(visibleCaptureDataUrl);
    ctx.drawImage(
      rawImg,
      cropRectPx.x,
      cropRectPx.y,
      cropRectPx.width,
      cropRectPx.height,
      0,
      0,
      finalWidthCss,
      finalHeightCss,
    );

    const format = options.format ?? 'webp';
    const mimeType =
      format === 'webp' ? 'image/webp' : format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const qualityFraction =
      typeof options.quality === 'number' ? Math.max(0, Math.min(1, options.quality / 100)) : 0.8;

    const dataUrl = await canvasToDataURL(croppedCanvas, mimeType, qualityFraction);
    return {
      dataUrl,
      widthCss: finalWidthCss,
      heightCss: finalHeightCss,
      originX: Math.round(cropRectPx.x / dpr),
      originY: Math.round(cropRectPx.y / dpr),
    };
  }

  /**
   * Capture full page
   */
  async _captureFullPage(
    tabId: number,
    options: ScreenshotToolParams,
    initialPageDetails: any,
    windowId?: number,
  ): Promise<string> {
    const dpr = initialPageDetails.devicePixelRatio;
    const totalWidthCss = options.width || initialPageDetails.totalWidth; // Use option width if provided
    const totalHeightCss = initialPageDetails.totalHeight; // Full page always uses actual height

    // Apply maximum height limit for infinite scroll pages
    const maxHeightPx = options.maxHeight || SCREENSHOT_CONSTANTS.MAX_CAPTURE_HEIGHT_PX;
    const limitedHeightCss = Math.min(totalHeightCss, maxHeightPx / dpr);

    const totalWidthPx = totalWidthCss * dpr;
    const totalHeightPx = limitedHeightCss * dpr;

    // Viewport dimensions (CSS pixels) - logged for debugging
    this.logInfo(
      `Viewport size: ${initialPageDetails.viewportWidth}x${initialPageDetails.viewportHeight} CSS pixels`,
    );
    this.logInfo(
      `Page dimensions: ${totalWidthCss}x${totalHeightCss} CSS pixels (limited to ${limitedHeightCss} height)`,
    );

    const viewportHeightCss = initialPageDetails.viewportHeight;

    const capturedParts = [];
    let currentScrollYCss = 0;
    let capturedHeightPx = 0;
    let partIndex = 0;

    while (capturedHeightPx < totalHeightPx && partIndex < SCREENSHOT_CONSTANTS.MAX_CAPTURE_PARTS) {
      this.logInfo(
        `Capturing part ${partIndex + 1}... (${Math.round((capturedHeightPx / totalHeightPx) * 100)}%)`,
      );

      if (currentScrollYCss > 0) {
        // Don't scroll for the first part if already at top
        const scrollResp = await this.sendMessageToTab(tabId, {
          action: TOOL_MESSAGE_TYPES.SCREENSHOT_SCROLL_PAGE,
          x: 0,
          y: currentScrollYCss,
          scrollDelay: SCREENSHOT_CONSTANTS.SCROLL_DELAY_MS,
        });
        // Update currentScrollYCss based on actual scroll achieved
        currentScrollYCss = scrollResp.newScrollY;
      }

      // Ensure rendering after scroll
      await new Promise((resolve) =>
        setTimeout(resolve, SCREENSHOT_CONSTANTS.CAPTURE_STITCH_DELAY_MS),
      );

      const targetTab = await chrome.tabs.get(tabId).catch(() => null);
      const dataUrl = targetTab
        ? await this.captureTabPng(targetTab)
        : typeof windowId === 'number'
          ? await chrome.tabs.captureVisibleTab(windowId, { format: 'png' })
          : await chrome.tabs.captureVisibleTab({ format: 'png' });
      if (!dataUrl) throw new Error('captureVisibleTab returned empty during full page capture');

      const yOffsetPx = currentScrollYCss * dpr;
      capturedParts.push({ dataUrl, y: yOffsetPx });

      const imgForHeight = await createImageBitmapFromUrl(dataUrl); // To get actual captured height
      const lastPartEffectiveHeightPx = Math.min(imgForHeight.height, totalHeightPx - yOffsetPx);

      capturedHeightPx = yOffsetPx + lastPartEffectiveHeightPx;

      if (capturedHeightPx >= totalHeightPx - SCREENSHOT_CONSTANTS.PIXEL_TOLERANCE) break;

      currentScrollYCss += viewportHeightCss;
      // Prevent overscrolling past the document height for the next scroll command
      if (
        currentScrollYCss > totalHeightCss - viewportHeightCss &&
        currentScrollYCss < totalHeightCss
      ) {
        currentScrollYCss = totalHeightCss - viewportHeightCss;
      }
      partIndex++;
    }

    // Check if we hit any limits
    if (partIndex >= SCREENSHOT_CONSTANTS.MAX_CAPTURE_PARTS) {
      this.logInfo(
        `Reached maximum number of capture parts (${SCREENSHOT_CONSTANTS.MAX_CAPTURE_PARTS}). This may be an infinite scroll page.`,
      );
    }
    if (totalHeightCss > limitedHeightCss) {
      this.logInfo(
        `Page height (${totalHeightCss}px) exceeds maximum capture height (${maxHeightPx / dpr}px). Capturing limited portion.`,
      );
    }

    this.logInfo('Stitching image...');
    const finalCanvas = await stitchImages(capturedParts, totalWidthPx, totalHeightPx);

    // DPR 1:1 Normalization: enforce output dimensions to standard CSS pixels
    let targetWidthCss = totalWidthCss;
    let targetHeightCss = limitedHeightCss;

    if (options.width && !options.height) {
      targetWidthCss = options.width;
      const aspectRatio = finalCanvas.height / finalCanvas.width;
      targetHeightCss = Math.round(targetWidthCss * aspectRatio);
    } else if (options.height && !options.width) {
      targetHeightCss = options.height;
      const aspectRatio = finalCanvas.width / finalCanvas.height;
      targetWidthCss = Math.round(targetHeightCss * aspectRatio);
    } else if (options.width && options.height) {
      targetWidthCss = options.width;
      targetHeightCss = options.height;
    }

    const outputCanvas = new OffscreenCanvas(targetWidthCss, targetHeightCss);
    const ctx = outputCanvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(finalCanvas, 0, 0, targetWidthCss, targetHeightCss);
    }

    const format = options.format || 'webp';
    const targetMime =
      format === 'webp' ? 'image/webp' : format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const qualityFraction =
      typeof options.quality === 'number' ? Math.max(0, Math.min(1, options.quality / 100)) : 0.8;
    return canvasToDataURL(outputCanvas, targetMime, qualityFraction);
  }
}

export const screenshotTool = new ScreenshotTool();
