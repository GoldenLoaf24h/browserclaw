import { BaseWatchdog } from './base-watchdog';
import { dialogWatchdog, DialogWatchdog } from './dialog-watchdog';
import { downloadsWatchdog, DownloadsWatchdog } from './downloads-watchdog';
import { crashWatchdog, CrashWatchdog } from './crash-watchdog';

export * from './base-watchdog';
export * from './dialog-watchdog';
export * from './downloads-watchdog';
export * from './crash-watchdog';

export class WatchdogCluster {
  private watchdogs: BaseWatchdog[] = [dialogWatchdog, downloadsWatchdog, crashWatchdog];

  public startAll(): void {
    for (const wd of this.watchdogs) {
      try {
        void wd.start();
      } catch (err) {
        console.error(`[WatchdogCluster] Failed to start watchdog "${wd.name}":`, err);
      }
    }
  }

  public stopAll(): void {
    for (const wd of this.watchdogs) {
      try {
        void wd.stop();
      } catch (err) {
        console.error(`[WatchdogCluster] Failed to stop watchdog "${wd.name}":`, err);
      }
    }
  }

  public getWatchdog<T extends BaseWatchdog = BaseWatchdog>(name: string): T | undefined {
    return this.watchdogs.find((w) => w.name === name) as T | undefined;
  }
}

export const watchdogCluster = new WatchdogCluster();

export function initWatchdogs(): void {
  watchdogCluster.startAll();
}
