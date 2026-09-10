/**
 * Guard against agent code paths opening or navigating to popup.html.
 * popup.html is reserved exclusively for user manual interaction.
 */
export function isPopupUrl(url?: string): boolean {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();
  return (
    lowerUrl.includes('popup.html') ||
    (lowerUrl.startsWith('chrome-extension://') && lowerUrl.includes('popup'))
  );
}
