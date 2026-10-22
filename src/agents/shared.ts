// Tool results can be huge (full file dumps, command output). Keep enough for
// the extractor to understand what happened without letting a single result
// crowd real conversation out of the transcript token budget.
const MAX_TOOL_RESULT_CHARS = 1000;

export function truncateToolResult(text: string): string {
  if (text.length <= MAX_TOOL_RESULT_CHARS) return text;
  return `${text.slice(0, MAX_TOOL_RESULT_CHARS)}… [truncated]`;
}

// Tool-call arguments carry whole files (Write content, Edit strings, patches).
// The extractor needs to know which tool ran on what, not the payload.
const MAX_TOOL_INPUT_CHARS = 300;

export function truncateToolInput(text: string): string {
  if (text.length <= MAX_TOOL_INPUT_CHARS) return text;
  return `${text.slice(0, MAX_TOOL_INPUT_CHARS)}… [truncated]`;
}
