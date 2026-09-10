/**
 * Format an unexpected error for an agent-facing response.
 *
 * Every layer used to collapse a caught exception to `error.message`, so the
 * stack was gone by the time the agent saw it and a bug could only be located
 * by re-running with a debugger attached. Errors are rare compared to
 * successful calls, so shipping a bounded stack is cheap; the cap keeps a deep
 * React/Vite stack from dominating the response.
 *
 * Validation errors ("Either index or selector must be provided") are produced
 * deliberately by tools and should keep using plain strings — this helper is
 * for the catch blocks that handle the unexpected.
 */
export const DEFAULT_STACK_FRAMES = 5;
export const MAX_STACK_LINE_CHARS = 200;

export interface FormatErrorOptions {
  /** Prefix, e.g. the tool name or layer that failed. */
  context?: string;
  /** How many stack frames to keep (default 5, 0 disables the stack). */
  maxFrames?: number;
}

export function formatErrorForAgent(error: unknown, options: FormatErrorOptions = {}): string {
  const context = options.context ? `${options.context}: ` : '';

  if (!(error instanceof Error)) {
    return context + String(error);
  }

  const name = error.name && error.name !== 'Error' ? `${error.name}: ` : '';
  let text = `${context}${name}${error.message}`;

  const maxFrames =
    typeof options.maxFrames === 'number' ? options.maxFrames : DEFAULT_STACK_FRAMES;
  if (maxFrames <= 0 || typeof error.stack !== 'string') return text;

  // stack[0] is the "Name: message" line already emitted above.
  const frames = error.stack
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('at '));
  if (frames.length === 0) return text;

  const kept = frames.slice(0, maxFrames).map((line) =>
    line.length > MAX_STACK_LINE_CHARS ? `${line.slice(0, MAX_STACK_LINE_CHARS)}…` : line,
  );
  text += `\n${kept.join('\n')}`;
  if (frames.length > kept.length) {
    text += `\n  … ${frames.length - kept.length} more frame(s) omitted`;
  }
  return text;
}
