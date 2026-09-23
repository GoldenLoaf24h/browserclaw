/**
 * Credential-bearing query/fragment params (OAuth codes, tokens, session state)
 * are scrubbed from every URL written or returned to prevent secret leakage.
 * Pattern modeled directly after Browser-Harness (BH: src/browser_harness/recorder.py:44-53).
 */
const URL_SECRETS =
  /([?&#](?:code|access_token|id_token|refresh_token|token|assertion|client_secret|client_info|session_state|api_?key|sig|signature|auth|authorization|password|secret)=)[^&#]+/gi;

export function scrubUrl(url: string | null | undefined): string {
  if (!url || typeof url !== 'string') return '';
  return url.replace(URL_SECRETS, '$1REDACTED');
}
