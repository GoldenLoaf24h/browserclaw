import { initNativeHostListener } from './native-host';
import { initWatchdogs } from './watchdogs';

/**
 * Background script entry point
 * Initializes core native messaging bridge listener and watchdog cluster
 */
export default defineBackground(() => {
  // Initialize core services
  initNativeHostListener();
  initWatchdogs();
});
