/**
 * Image processing utility functions
 */

/**
 * Create ImageBitmap from data URL (for OffscreenCanvas)
 * @param dataUrl Image data URL
 * @returns Created ImageBitmap object
 */
export async function createImageBitmapFromUrl(dataUrl: string): Promise<ImageBitmap> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return await createImageBitmap(blob);
}

/**
 * Stitch multiple image parts (dataURL) onto a single canvas
 * @param parts Array of image parts, each containing dataUrl and y coordinate
 * @param totalWidthPx Total width (pixels)
 * @param totalHeightPx Total height (pixels)
 * @returns Stitched canvas
 */
export async function stitchImages(
  parts: { dataUrl: string; y: number }[],
  totalWidthPx: number,
  totalHeightPx: number,
): Promise<OffscreenCanvas> {
  const canvas = new OffscreenCanvas(totalWidthPx, totalHeightPx);
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Unable to get canvas context');
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const part of parts) {
    let img: ImageBitmap | null = null;
    try {
      img = await createImageBitmapFromUrl(part.dataUrl);
      const sx = 0;
      const sy = 0;
      const sWidth = img.width;
      let sHeight = img.height;
      const dy = part.y;

      if (dy + sHeight > totalHeightPx) {
        sHeight = totalHeightPx - dy;
      }

      if (sHeight <= 0) continue;

      ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, dy, sWidth, sHeight);
    } catch (error) {
      console.error('Error stitching image part:', error, part);
    } finally {
      if (img && typeof img.close === 'function') {
        img.close();
      }
    }
  }
  return canvas;
}

/**
 * Crop image (from dataURL) to specified rectangle and resize
 * @param originalDataUrl Original image data URL
 * @param cropRectPx Crop rectangle (physical pixels)
 * @param dpr Device pixel ratio
 * @param targetWidthOpt Optional target output width (CSS pixels)
 * @param targetHeightOpt Optional target output height (CSS pixels)
 * @returns Cropped canvas
 */
export async function cropAndResizeImage(
  originalDataUrl: string,
  cropRectPx: { x: number; y: number; width: number; height: number },
  dpr: number = 1,
  targetWidthOpt?: number,
  targetHeightOpt?: number,
): Promise<OffscreenCanvas> {
  const img = await createImageBitmapFromUrl(originalDataUrl);
  try {
    let sx = cropRectPx.x;
    let sy = cropRectPx.y;
    let sWidth = cropRectPx.width;
    let sHeight = cropRectPx.height;

    // Ensure crop area is within image boundaries
    if (sx < 0) {
      sWidth += sx;
      sx = 0;
    }
    if (sy < 0) {
      sHeight += sy;
      sy = 0;
    }
    if (sx + sWidth > img.width) {
      sWidth = img.width - sx;
    }
    if (sy + sHeight > img.height) {
      sHeight = img.height - sy;
    }

    if (sWidth <= 0 || sHeight <= 0) {
      throw new Error(
        'Invalid calculated crop size (<=0). Element may not be visible or fully captured.',
      );
    }

    let finalCanvasWidthPx: number;
    let finalCanvasHeightPx: number;

    if (targetWidthOpt && targetHeightOpt) {
      finalCanvasWidthPx = targetWidthOpt * dpr;
      finalCanvasHeightPx = targetHeightOpt * dpr;
    } else if (targetWidthOpt && !targetHeightOpt) {
      finalCanvasWidthPx = targetWidthOpt * dpr;
      finalCanvasHeightPx = Math.round((finalCanvasWidthPx * sHeight) / sWidth);
    } else if (!targetWidthOpt && targetHeightOpt) {
      finalCanvasHeightPx = targetHeightOpt * dpr;
      finalCanvasWidthPx = Math.round((finalCanvasHeightPx * sWidth) / sHeight);
    } else {
      finalCanvasWidthPx = sWidth;
      finalCanvasHeightPx = sHeight;
    }

    const canvas = new OffscreenCanvas(finalCanvasWidthPx, finalCanvasHeightPx);
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Unable to get canvas context');
    }

    ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, finalCanvasWidthPx, finalCanvasHeightPx);

    return canvas;
  } finally {
    if (img && typeof img.close === 'function') {
      img.close();
    }
  }
}

/**
 * Convert canvas to data URL
 * @param canvas Canvas
 * @param format Image format
 * @param quality JPEG quality (0-1)
 * @returns Data URL
 */
export async function canvasToDataURL(
  canvas: OffscreenCanvas,
  format: string = 'image/png',
  quality?: number,
): Promise<string> {
  const isLossy = format === 'image/jpeg' || format === 'image/webp';
  const blob = await canvas.convertToBlob({
    type: format,
    quality: isLossy ? quality : undefined,
  });

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Compresses an image by scaling it and converting it to a target format with a specific quality.
 * This is the most effective way to reduce image data size for transport or storage.
 *
 * @param {string} imageDataUrl - The original image data URL (e.g., from captureVisibleTab).
 * @param {object} options - Compression options.
 * @param {number} [options.scale=1.0] - The scaling factor for dimensions (e.g., 0.7 for 70%).
 * @param {number} [options.quality=0.8] - The quality for lossy formats like JPEG (0.0 to 1.0).
 * @param {string} [options.format='image/jpeg'] - The target image format.
 * @returns {Promise<{dataUrl: string, mimeType: string}>} A promise that resolves to the compressed image data URL and its MIME type.
 */
export async function compressImage(
  imageDataUrl: string,
  options: { scale?: number; quality?: number; format?: 'image/jpeg' | 'image/webp' | 'image/png' },
): Promise<{ dataUrl: string; mimeType: string }> {
  const { scale = 1.0, quality = 0.8, format = 'image/jpeg' } = options;

  // 1. Create an ImageBitmap from the original data URL for efficient drawing.
  const imageBitmap = await createImageBitmapFromUrl(imageDataUrl);
  try {
    // 2. Calculate the new dimensions based on the scale factor.
    const newWidth = Math.round(imageBitmap.width * scale);
    const newHeight = Math.round(imageBitmap.height * scale);

    // 3. Use OffscreenCanvas for performance, as it doesn't need to be in the DOM.
    const canvas = new OffscreenCanvas(newWidth, newHeight);
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Failed to get 2D context from OffscreenCanvas');
    }

    // 4. Draw the original image onto the smaller canvas, effectively resizing it.
    ctx.drawImage(imageBitmap, 0, 0, newWidth, newHeight);

    // 5. Export the canvas content to the target format with the specified quality.
    // This is the step that performs the data compression.
    const compressedDataUrl = await canvas.convertToBlob({ type: format, quality: quality });

    // A helper to convert blob to data URL since OffscreenCanvas.toDataURL is not standard yet
    // on all execution contexts (like service workers).
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(compressedDataUrl);
    });

    return { dataUrl, mimeType: format };
  } finally {
    if (imageBitmap && typeof imageBitmap.close === 'function') {
      imageBitmap.close();
    }
  }
}

/**
 * Overlay semi-transparent coordinate reference grid with dashed lines and (x, y) markers
 * on a screenshot to eliminate visual estimation hallucination for multimodal models.
 */
export async function overlayCoordinateGrid(
  imageDataUrl: string,
  dpr: number = 1,
  gridStepCss: number = 100,
  format: string = 'image/png',
  quality?: number,
): Promise<string> {
  const imageBitmap = await createImageBitmapFromUrl(imageDataUrl);
  try {
    const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context from OffscreenCanvas');
    }

    // Draw base image
    ctx.drawImage(imageBitmap, 0, 0);

    const stepPx = Math.max(10, Math.round(gridStepCss * dpr));
    ctx.save();
    ctx.lineWidth = Math.max(1, Math.round(dpr));
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.strokeStyle = 'rgba(255, 30, 80, 0.35)'; // high contrast semi-transparent red

    // Draw vertical grid lines
    for (let x = stepPx; x < canvas.width; x += stepPx) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    // Draw horizontal grid lines
    for (let y = stepPx; y < canvas.height; y += stepPx) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Draw coordinate labels at intersections and along axes
    ctx.setLineDash([]);
    const fontSize = Math.max(9, Math.round(9 * dpr));
    ctx.font = `${fontSize}px monospace`;

    // Intersections: Draw unobtrusive, semi-transparent labels at 200px intervals (or 100px on small canvases)
    const intersectionInterval = canvas.width > 800 && canvas.height > 600 ? stepPx * 2 : stepPx;
    for (let x = intersectionInterval; x < canvas.width; x += intersectionInterval) {
      for (let y = intersectionInterval; y < canvas.height; y += intersectionInterval) {
        const xCss = Math.round(x / dpr);
        const yCss = Math.round(y / dpr);
        const label = `(${xCss},${yCss})`;
        const tm = ctx.measureText(label);
        const pad = 1.5 * dpr;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.45)'; // semi-transparent slate
        ctx.fillRect(x + pad, y + pad, tm.width + pad * 2, fontSize + pad * 2);
        ctx.fillStyle = '#00ffff'; // bright cyan text
        ctx.fillText(label, x + pad * 2, y + pad + fontSize);
      }
    }

    // Along top axis
    for (let x = stepPx; x < canvas.width; x += stepPx) {
      const xCss = Math.round(x / dpr);
      const label = `x:${xCss}`;
      const tm = ctx.measureText(label);
      const pad = 1.5 * dpr;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
      ctx.fillRect(x + pad, pad, tm.width + pad * 2, fontSize + pad * 2);
      ctx.fillStyle = '#facc15'; // bright amber text
      ctx.fillText(label, x + pad * 2, pad + fontSize);
    }

    // Along left axis
    for (let y = stepPx; y < canvas.height; y += stepPx) {
      const yCss = Math.round(y / dpr);
      const label = `y:${yCss}`;
      const tm = ctx.measureText(label);
      const pad = 1.5 * dpr;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
      ctx.fillRect(pad, y + pad, tm.width + pad * 2, fontSize + pad * 2);
      ctx.fillStyle = '#facc15'; // bright amber text
      ctx.fillText(label, pad * 2, y + pad + fontSize);
    }

    ctx.restore();

    return await canvasToDataURL(canvas, format, quality);
  } finally {
    if (imageBitmap && typeof imageBitmap.close === 'function') {
      imageBitmap.close();
    }
  }
}
