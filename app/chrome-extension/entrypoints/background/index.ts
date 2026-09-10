import { initNativeHostListener } from './native-host';

/**
 * Background script entry point
 * Initializes core native messaging bridge listener
 */
export default defineBackground(() => {
  // Initialize core services
  initNativeHostListener();
});
