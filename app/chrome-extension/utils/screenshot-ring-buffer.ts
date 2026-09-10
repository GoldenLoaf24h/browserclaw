export interface ScreenshotBufferEntry {
  id: string;
  tabId: number;
  timestamp: number;
  mimeType: string;
  width: number;
  height: number;
  dataBase64: string;
}

export class ScreenshotRingBuffer {
  private capacity: number;
  private buffer: ScreenshotBufferEntry[] = [];

  constructor(capacity = 1) {
    this.capacity = Math.max(1, capacity);
  }

  public setCapacity(newCapacity: number): void {
    this.capacity = Math.max(1, newCapacity);
    while (this.buffer.length > this.capacity) {
      this.buffer.shift();
    }
  }

  public getCapacity(): number {
    return this.capacity;
  }

  public push(entry: Omit<ScreenshotBufferEntry, 'id' | 'timestamp'> & { id?: string; timestamp?: number }): ScreenshotBufferEntry {
    const fullEntry: ScreenshotBufferEntry = {
      id: entry.id || `shot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: entry.timestamp || Date.now(),
      tabId: entry.tabId,
      mimeType: entry.mimeType,
      width: entry.width,
      height: entry.height,
      dataBase64: entry.dataBase64,
    };

    this.buffer.push(fullEntry);
    while (this.buffer.length > this.capacity) {
      this.buffer.shift();
    }
    return fullEntry;
  }

  public getLatest(tabId?: number): ScreenshotBufferEntry | undefined {
    if (typeof tabId === 'number') {
      for (let i = this.buffer.length - 1; i >= 0; i--) {
        if (this.buffer[i].tabId === tabId) {
          return this.buffer[i];
        }
      }
      return undefined;
    }
    return this.buffer[this.buffer.length - 1];
  }

  public getAll(): ScreenshotBufferEntry[] {
    return [...this.buffer];
  }

  public getSize(): number {
    return this.buffer.length;
  }

  public clear(): void {
    this.buffer = [];
  }
}

export const screenshotRingBuffer = new ScreenshotRingBuffer(1);
