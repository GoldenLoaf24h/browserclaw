/**
 * Base Watchdog & Decoupled Async Event Bus
 * Provides robust lifecycle management, typed event emission, and error boundaries.
 */

export type WatchdogEventListener<T = any> = (data: T) => void | Promise<void>;

export abstract class BaseWatchdog {
  public abstract readonly name: string;
  public abstract readonly listensTo: string[];
  protected isRunning = false;
  private listeners = new Map<string, Set<WatchdogEventListener>>();

  public abstract start(): void | Promise<void>;
  public abstract stop(): void | Promise<void>;

  public get active(): boolean {
    return this.isRunning;
  }

  public on<T = any>(event: string, listener: WatchdogEventListener<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return () => this.off(event, listener);
  }

  public off<T = any>(event: string, listener: WatchdogEventListener<T>): void {
    this.listeners.get(event)?.delete(listener);
    if (this.listeners.get(event)?.size === 0) {
      this.listeners.delete(event);
    }
  }

  public emit<T = any>(event: string, data: T): void {
    const handlers = this.listeners.get(event);
    if (!handlers || handlers.size === 0) return;
    for (const listener of handlers) {
      try {
        const res = listener(data);
        if (res && typeof (res as any).catch === 'function') {
          (res as any).catch((err: any) => {
            console.error(
              `[Watchdog:${this.name}] Error in async event handler for "${event}":`,
              err,
            );
          });
        }
      } catch (err) {
        console.error(`[Watchdog:${this.name}] Error in event handler for "${event}":`, err);
      }
    }
  }

  public removeAllListeners(event?: string): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}
