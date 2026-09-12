export interface WaitForDownloadOptions {
  filenameContains?: string;
  waitForComplete?: boolean;
  timeoutMs?: number;
}

export interface DownloadDetails {
  id: number;
  filename?: string;
  url?: string;
  mime?: string;
  fileSize?: number;
  state: string;
  danger?: string;
  startTime?: string;
  endTime?: string;
  exists?: boolean;
}

export async function waitForDownload(opts: WaitForDownloadOptions): Promise<DownloadDetails> {
  const filenameContains = String(opts.filenameContains || '').trim();
  const waitForComplete = opts.waitForComplete !== false;
  const timeoutMs = Math.max(10, Math.min(Number(opts.timeoutMs ?? 60000), 300000));
  const callTime = Date.now();

  return new Promise<DownloadDetails>((resolve, reject) => {
    let timer: any = null;
    let isSettled = false;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      try {
        chrome.downloads.onCreated.removeListener(onCreated);
      } catch {}
      try {
        chrome.downloads.onChanged.removeListener(onChanged);
      } catch {}
    };

    const onError = (err: any) => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const matches = (item: chrome.downloads.DownloadItem) => {
      if (!item) return false;
      if (!filenameContains) return true;
      const name = (item.filename || '').split(/[/\\]/).pop() || '';
      return name.includes(filenameContains) || (item.url || '').includes(filenameContains);
    };

    const fulfill = async (item: chrome.downloads.DownloadItem) => {
      if (isSettled) return;
      isSettled = true;
      cleanup();

      try {
        const [found] = await chrome.downloads.search({ id: item.id });
        const out = found || item;
        resolve({
          id: out.id,
          filename: out.filename,
          url: out.url,
          mime: (out as any).mime || undefined,
          fileSize: out.fileSize ?? out.totalBytes ?? undefined,
          state: out.state,
          danger: out.danger,
          startTime: out.startTime,
          endTime: (out as any).endTime || undefined,
          exists: (out as any).exists,
        });
      } catch {
        resolve({ id: item.id, filename: item.filename, url: item.url, state: item.state });
      }
    };

    const onCreated = (item: chrome.downloads.DownloadItem) => {
      try {
        if (isSettled || !matches(item)) return;
        if (item.state === 'interrupted') {
          onError(new Error(`Download interrupted: ${item.error || 'interrupted'}`));
          return;
        }
        if (!waitForComplete || item.state === 'complete') {
          fulfill(item);
        }
      } catch {}
    };

    const onChanged = (delta: chrome.downloads.DownloadDelta) => {
      try {
        if (isSettled || !delta || typeof delta.id !== 'number') return;
        chrome.downloads
          .search({ id: delta.id })
          .then((arr) => {
            if (isSettled) return;
            const item = arr && arr[0];
            if (!item || !matches(item)) return;
            if (item.state === 'interrupted' || delta.state?.current === 'interrupted') {
              onError(
                new Error(
                  `Download interrupted: ${item.error || delta.error?.current || 'interrupted'}`,
                ),
              );
              return;
            }
            if (waitForComplete) {
              if (item.state === 'complete') fulfill(item);
            } else {
              fulfill(item);
            }
          })
          .catch(() => {});
      } catch {}
    };

    chrome.downloads.onCreated.addListener(onCreated);
    chrome.downloads.onChanged.addListener(onChanged);
    timer = setTimeout(() => onError(new Error('Download wait timed out')), timeoutMs);

    // Initial check: search for already-running (in_progress) or recently completed matching downloads
    // Lookback window: 30s when filename specified, 5s when unspecified to prevent capturing stale downloads
    const lookbackMs = filenameContains ? 30000 : 5000;
    const searchStartTime = callTime - lookbackMs;

    chrome.downloads
      .search({ orderBy: ['-startTime'], limit: 30 })
      .then((arr) => {
        if (isSettled) return;
        const matching = (arr || []).filter((d) => {
          if (!matches(d)) return false;
          const itemStartTime = d.startTime ? new Date(d.startTime).getTime() : 0;
          const itemEndTime = (d as any).endTime ? new Date((d as any).endTime).getTime() : 0;
          const latestActivityTime = Math.max(itemStartTime, itemEndTime);
          return !isNaN(latestActivityTime) && latestActivityTime >= searchStartTime;
        });
        if (matching.length === 0) return;

        if (waitForComplete) {
          const completeHit = matching.find((d) => d.state === 'complete');
          if (completeHit) {
            fulfill(completeHit);
            return;
          }

          // If recently interrupted with no in_progress alternative, fail early
          const interruptedHit = matching.find((d) => d.state === 'interrupted');
          const inProgressHit = matching.find((d) => d.state === 'in_progress');
          if (interruptedHit && !inProgressHit) {
            onError(new Error(`Download interrupted: ${interruptedHit.error || 'interrupted'}`));
            return;
          }
        } else {
          const hit = matching.find((d) => d.state === 'in_progress' || d.state === 'complete');
          if (hit) {
            fulfill(hit);
            return;
          }
        }
      })
      .catch(() => {});
  });
}

/**
 * Polls chrome.downloads.search to resolve the full disk filepath of a download item.
 * Avoids returning a temporary or relative filename before Chrome has determined the target path.
 */
export async function resolveDownloadedFilePath(
  downloadId: number,
  fallbackFilename: string,
  maxWaitMs = 1500,
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const [item] = await chrome.downloads.search({ id: downloadId });
      if (item?.filename && item.filename.length > 0) {
        return item.filename;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  try {
    const [item] = await chrome.downloads.search({ id: downloadId });
    if (item?.filename) return item.filename;
  } catch {}
  return fallbackFilename;
}
