import { BaseWatchdog } from './base-watchdog';

export interface DownloadTrackItem {
  id: number;
  url: string;
  filename?: string;
  totalBytes: number;
  bytesReceived: number;
  state: 'in_progress' | 'interrupted' | 'complete';
  danger?: string;
  paused: boolean;
  startTime: number;
  endTime?: number;
  error?: string;
}

/**
 * Downloads Watchdog
 * Decoupled async tracker for browser downloads via chrome.downloads API.
 * Emits 'download-created', 'download-changed', 'download-complete', 'download-interrupted'.
 */
export class DownloadsWatchdog extends BaseWatchdog {
  public readonly name = 'downloads';
  public readonly listensTo = ['chrome.downloads.onCreated', 'chrome.downloads.onChanged'];
  private downloads = new Map<number, DownloadTrackItem>();
  private onCreatedListener: ((item: any) => void) | null = null;
  private onChangedListener: ((delta: any) => void) | null = null;

  public start(): void {
    if (this.isRunning) return;
    if (typeof chrome === 'undefined' || !chrome.downloads) {
      return;
    }
    this.isRunning = true;

    this.onCreatedListener = (item: any) => {
      const track: DownloadTrackItem = {
        id: item.id,
        url: item.url,
        filename: item.filename,
        totalBytes: item.totalBytes || 0,
        bytesReceived: item.bytesReceived || 0,
        state: item.state || 'in_progress',
        danger: item.danger,
        paused: Boolean(item.paused),
        startTime: Date.now(),
      };
      this.downloads.set(item.id, track);
      this.emit('download-created', track);
    };

    this.onChangedListener = (delta: any) => {
      const existing = this.downloads.get(delta.id);
      if (!existing) return;

      if (delta.filename) existing.filename = delta.filename.current;
      if (delta.state) existing.state = delta.state.current;
      if (delta.totalBytes) existing.totalBytes = delta.totalBytes.current;
      if (delta.error) existing.error = delta.error.current;
      if (delta.paused) existing.paused = delta.paused.current;

      this.emit('download-changed', { id: delta.id, delta, item: existing });

      if (delta.state?.current === 'complete') {
        existing.endTime = Date.now();
        this.emit('download-complete', existing);
      } else if (delta.state?.current === 'interrupted') {
        existing.endTime = Date.now();
        this.emit('download-interrupted', existing);
      }
    };

    try {
      chrome.downloads.onCreated.addListener(this.onCreatedListener);
      chrome.downloads.onChanged.addListener(this.onChangedListener);
    } catch {}
  }

  public stop(): void {
    if (!this.isRunning) return;
    if (typeof chrome !== 'undefined' && chrome.downloads) {
      if (this.onCreatedListener) {
        try {
          chrome.downloads.onCreated.removeListener(this.onCreatedListener);
        } catch {}
        this.onCreatedListener = null;
      }
      if (this.onChangedListener) {
        try {
          chrome.downloads.onChanged.removeListener(this.onChangedListener);
        } catch {}
        this.onChangedListener = null;
      }
    }
    this.downloads.clear();
    this.isRunning = false;
  }

  public getActiveDownloads(): DownloadTrackItem[] {
    return Array.from(this.downloads.values()).filter((d) => d.state === 'in_progress');
  }

  public getDownload(id: number): DownloadTrackItem | undefined {
    return this.downloads.get(id);
  }
}

export const downloadsWatchdog = new DownloadsWatchdog();
